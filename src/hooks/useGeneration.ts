import { useCallback } from 'react';
import type { Element, ImageElement, VideoElement, Point, Tool } from '../types';
import { editImage, generateImageFromText, generateVideo } from '../services/geminiService';
import { generateImageWithProvider, inferProviderFromModel } from '../services/aiGateway';
import { rasterizeElement, rasterizeMask } from '../utils/rasterize';
import { generateId } from '../utils/id';
import { getElementBounds } from '../utils/geometry';
import { useUIStore } from '../stores/useUIStore';
import { useAIStore } from '../stores/useAIStore';

interface GenerationParams {
    elements: Element[];
    selectedElementIds: string[];
    commitAction: (updater: (prev: Element[]) => Element[]) => void;
    setSelectedElementIds: (ids: string[]) => void;
    svgRef: React.RefObject<SVGSVGElement | null>;
    getCanvasPoint: (screenX: number, screenY: number) => Point;
    saveGenerationToHistory: (payload: {
        name?: string;
        dataUrl: string;
        mimeType: string;
        width: number;
        height: number;
        prompt: string;
    }) => void;
    setActiveTool: (tool: Tool) => void;
}

export function useGeneration({
    elements,
    selectedElementIds,
    commitAction,
    setSelectedElementIds,
    svgRef,
    getCanvasPoint,
    saveGenerationToHistory,
    setActiveTool,
}: GenerationParams) {
    const { setIsLoading, setError, setProgressMessage, setSettingsPanelOpen: setIsSettingsPanelOpen } = useUIStore();
    const {
        prompt,
        isAutoEnhanceEnabled,
        enhancePrompt: handleEnhancePrompt,
        generationMode,
        videoAspectRatio,
        modelPreference,
        userApiKeys,
        mentionedElementIds,
        chatAttachments,
        promptAttachments,
        characterLocks,
        activeCharacterLockId,
    } = useAIStore();

    const activeCharacterLock = activeCharacterLockId
        ? characterLocks.find((lock) => lock.id === activeCharacterLockId) || null
        : null;

    const handleGenerate = async (promptOverride?: string, source: 'prompt' | 'right' = 'prompt') => {
        let rawPrompt = (promptOverride ?? prompt).trim();
        if (!rawPrompt) {
            setError('Please enter a prompt.');
            return;
        }

        // 自动润色：如果开关开启且有文本 LLM 能力的 Key，则先润色
        if (isAutoEnhanceEnabled && !promptOverride) {
            try {
                setProgressMessage('Enhancing prompt with LLM...');
                const enhanced = await handleEnhancePrompt({ prompt: rawPrompt, mode: 'smart' });
                if (enhanced?.enhancedPrompt?.trim()) {
                    rawPrompt = enhanced.enhancedPrompt.trim();
                }
            } catch (e) {
                console.warn('[Auto-Enhance] Enhancement failed, using original prompt:', e);
            }
        }

        // 预检：是否配置了对应能力的 API Key
        const neededCapability: 'image' | 'video' = generationMode === 'video' ? 'video' : 'image';
        const neededProvider =
            neededCapability === 'video'
                ? inferProviderFromModel(modelPreference.videoModel)
                : inferProviderFromModel(modelPreference.imageModel);
        const hasKey = userApiKeys.some((k) => {
            const caps = k.capabilities?.length ? k.capabilities : [];
            return caps.includes(neededCapability) && k.provider === neededProvider;
        });
        if (!hasKey) {
            setError(
                `No ${neededCapability === 'video' ? 'video' : 'image'} generation API Key found for  ${neededProvider}. Please add one in Settings → API Config.`,
            );
            setIsSettingsPanelOpen(true);
            return;
        }

        setIsLoading(true);
        setError(null);
        setProgressMessage('Preparing generation...');

        const getMimeFromDataUrl = (href: string) => {
            const match = href.match(/^data:([^;]+);base64,/i);
            return match?.[1] || 'image/png';
        };
        const effectivePrompt = activeCharacterLock ? `${activeCharacterLock.descriptor}\n\n${rawPrompt}` : rawPrompt;
        const characterReferenceImages = activeCharacterLock
            ? [
                  {
                      href: activeCharacterLock.referenceImage,
                      mimeType: getMimeFromDataUrl(activeCharacterLock.referenceImage),
                  },
              ]
            : [];
        const activeAttachments = source === 'right' ? chatAttachments : promptAttachments;
        const attachmentReferenceImages = activeAttachments.map((item) => ({
            href: item.href,
            mimeType: item.mimeType,
        }));
        const imageProvider = inferProviderFromModel(modelPreference.imageModel);
        const videoProvider = inferProviderFromModel(modelPreference.videoModel);
        const supportsReferenceEditing = imageProvider === 'google';
        const imageOutputName = generationMode === 'keyframe' ? 'Keyframe' : 'Generated Image';

        if (generationMode === 'video') {
            try {
                if (videoProvider !== 'google') {
                    throw new Error(
                        'Current video generation only supports Google Veo models. Please configure a Google video API key in settings.',
                    );
                }
                const selectedElements = elements.filter((el) => selectedElementIds.includes(el.id));
                const imageElement = selectedElements.find((el) => el.type === 'image') as ImageElement | undefined;
                const attachmentImage = activeAttachments[0];

                // Collect @mentioned images as additional reference sources
                const mentionedImages = mentionedElementIds
                    .map((id) => elements.find((el) => el.id === id))
                    .filter((el): el is ImageElement => !!el && el.type === 'image');

                // Priority: selected element > first @mentioned image > first attachment
                const baseVideoReference = imageElement
                    ? { href: imageElement.href, mimeType: imageElement.mimeType }
                    : mentionedImages.length > 0
                      ? { href: mentionedImages[0].href, mimeType: mentionedImages[0].mimeType }
                      : attachmentImage
                        ? { href: attachmentImage.href, mimeType: attachmentImage.mimeType }
                        : undefined;

                if (selectedElementIds.length > 1 || (selectedElementIds.length === 1 && !imageElement)) {
                    setError('For video generation, please select a single image or no elements.');
                    setIsLoading(false);
                    return;
                }

                const { videoBlob, mimeType } = await generateVideo(
                    effectivePrompt,
                    videoAspectRatio,
                    (message) => setProgressMessage(message),
                    baseVideoReference,
                );

                setProgressMessage('Processing video...');
                const videoUrl = URL.createObjectURL(videoBlob);
                const video = document.createElement('video');

                video.onloadedmetadata = () => {
                    if (!svgRef.current) return;

                    let newWidth = video.videoWidth;
                    let newHeight = video.videoHeight;
                    const MAX_DIM = 800;
                    if (newWidth > MAX_DIM || newHeight > MAX_DIM) {
                        const ratio = newWidth / newHeight;
                        if (ratio > 1) {
                            // landscape
                            newWidth = MAX_DIM;
                            newHeight = MAX_DIM / ratio;
                        } else {
                            // portrait or square
                            newHeight = MAX_DIM;
                            newWidth = MAX_DIM * ratio;
                        }
                    }

                    const svgBounds = svgRef.current.getBoundingClientRect();
                    const screenCenter = {
                        x: svgBounds.left + svgBounds.width / 2,
                        y: svgBounds.top + svgBounds.height / 2,
                    };
                    const canvasPoint = getCanvasPoint(screenCenter.x, screenCenter.y);
                    const x = canvasPoint.x - newWidth / 2;
                    const y = canvasPoint.y - newHeight / 2;

                    const newVideoElement: VideoElement = {
                        id: generateId(),
                        type: 'video',
                        name: 'Generated Video',
                        x,
                        y,
                        width: newWidth,
                        height: newHeight,
                        href: videoUrl,
                        mimeType,
                    };

                    commitAction((prev) => [...prev, newVideoElement]);
                    setSelectedElementIds([newVideoElement.id]);
                    setIsLoading(false);
                };

                video.onerror = () => {
                    setError('Could not load generated video metadata.');
                    setIsLoading(false);
                };

                video.src = videoUrl;
            } catch (err) {
                const error = err as Error;
                setError(`Video generation failed: ${error.message}`);
                console.error('Video generation failed:', error);
                setIsLoading(false);
            }
            return;
        }

        // IMAGE GENERATION LOGIC
        try {
            const isEditing = selectedElementIds.length > 0;

            // Collect @mention reference images (閸欘亜褰囬崶鍓у缁鍘撶槐鐙呯礉閹烘帡娅庡鎻掓躬 selection 娑擃厾娈?
            const mentionedImageElements = mentionedElementIds
                .map((id) => elements.find((el) => el.id === id))
                .filter((el): el is ImageElement => !!el && el.type === 'image' && !selectedElementIds.includes(el.id));

            if (isEditing) {
                if (!supportsReferenceEditing) {
                    setError(
                        'The current image model does not support whiteboard-based editing or compositing. Please switch to a Gemini or Imagen image model.',
                    );
                    return;
                }
                const selectedElements = elements.filter((el) => selectedElementIds.includes(el.id));
                const imageElements = selectedElements.filter((el) => el.type === 'image') as ImageElement[];
                const maskPaths = selectedElements.filter(
                    (el) => el.type === 'path' && el.strokeOpacity && el.strokeOpacity < 1,
                ) as PathElement[];

                // Inpainting logic: selection is ONLY one image and one or more mask paths
                if (
                    imageElements.length === 1 &&
                    maskPaths.length > 0 &&
                    selectedElements.length === 1 + maskPaths.length
                ) {
                    const baseImage = imageElements[0];
                    const maskData = await rasterizeMask(maskPaths, baseImage);
                    const result = await editImage(
                        [{ href: baseImage.href, mimeType: baseImage.mimeType }],
                        effectivePrompt,
                        { href: maskData.href, mimeType: maskData.mimeType },
                    );

                    if (result.newImageBase64 && result.newImageMimeType) {
                        const { newImageBase64, newImageMimeType } = result;

                        const img = new Image();
                        img.onload = () => {
                            const maskPathIds = new Set(maskPaths.map((p) => p.id));
                            const nextDataUrl = `data:${newImageMimeType};base64,${newImageBase64}`;
                            commitAction((prev) =>
                                prev
                                    .map((el) => {
                                        if (el.id === baseImage.id && el.type === 'image') {
                                            return {
                                                ...el,
                                                href: nextDataUrl,
                                                width: img.width,
                                                height: img.height,
                                            };
                                        }
                                        return el;
                                    })
                                    .filter((el) => !maskPathIds.has(el.id)),
                            );
                            setSelectedElementIds([baseImage.id]);
                            saveGenerationToHistory({
                                name: baseImage.name || 'Edited image',
                                dataUrl: nextDataUrl,
                                mimeType: newImageMimeType,
                                width: img.width,
                                height: img.height,
                                prompt: effectivePrompt,
                            });
                        };
                        img.onerror = () => setError('Failed to load the generated image.');
                        img.src = `data:${newImageMimeType};base64,${newImageBase64}`;
                    } else {
                        setError(result.textResponse || 'Inpainting failed to produce an image.');
                    }
                    return; // End execution for inpainting path
                }

                // Regular edit/combine logic (append @mention refs at the end)
                const imagePromises = selectedElements.map((el) => {
                    if (el.type === 'image') return Promise.resolve({ href: el.href, mimeType: el.mimeType });
                    if (el.type === 'video')
                        return Promise.reject(new Error('Cannot use video elements in image generation.'));
                    return rasterizeElement(el as Exclude<Element, ImageElement | VideoElement>);
                });
                const imagesToProcess = await Promise.all(imagePromises);

                // Append @mentioned reference images
                const mentionRefs = mentionedImageElements.map((el) => ({ href: el.href, mimeType: el.mimeType }));
                const result = await editImage(
                    [...imagesToProcess, ...mentionRefs, ...attachmentReferenceImages, ...characterReferenceImages],
                    effectivePrompt,
                );

                if (result.newImageBase64 && result.newImageMimeType) {
                    const { newImageBase64, newImageMimeType } = result;

                    const img = new Image();
                    img.onload = () => {
                        let minX = Infinity,
                            minY = Infinity,
                            maxX = -Infinity;
                        selectedElements.forEach((el) => {
                            const bounds = getElementBounds(el);
                            minX = Math.min(minX, bounds.x);
                            minY = Math.min(minY, bounds.y);
                            maxX = Math.max(maxX, bounds.x + bounds.width);
                        });
                        const x = maxX + 20;
                        const y = minY;

                        const newImage: ImageElement = {
                            id: generateId(),
                            type: 'image',
                            x,
                            y,
                            name: imageOutputName,
                            width: img.width,
                            height: img.height,
                            href: `data:${newImageMimeType};base64,${newImageBase64}`,
                            mimeType: newImageMimeType,
                        };
                        commitAction((prev) => [...prev, newImage]);
                        setSelectedElementIds([newImage.id]);
                        saveGenerationToHistory({
                            name: newImage.name,
                            dataUrl: newImage.href,
                            mimeType: newImage.mimeType,
                            width: newImage.width,
                            height: newImage.height,
                            prompt: effectivePrompt,
                        });
                    };
                    img.onerror = () => setError('Failed to load the generated image.');
                    img.src = `data:${newImageMimeType};base64,${newImageBase64}`;
                } else {
                    setError(result.textResponse || 'Generation failed to produce an image.');
                }
            } else if (mentionedImageElements.length > 0) {
                if (!supportsReferenceEditing) {
                    setError(
                        'The current image model does not support @ reference image generation. Please switch to a Gemini or Imagen image model.',
                    );
                    return;
                }
                // No canvas selection, but user @mentioned image elements 閿?use editImage as reference-guided generation
                setProgressMessage('Generating with reference images...');
                const mentionRefs = mentionedImageElements.map((el) => ({ href: el.href, mimeType: el.mimeType }));
                const result = await editImage(
                    [...mentionRefs, ...attachmentReferenceImages, ...characterReferenceImages],
                    effectivePrompt,
                );

                if (result.newImageBase64 && result.newImageMimeType) {
                    const { newImageBase64, newImageMimeType } = result;
                    const img = new Image();
                    img.onload = () => {
                        if (!svgRef.current) return;
                        const svgBounds = svgRef.current.getBoundingClientRect();
                        const screenCenter = {
                            x: svgBounds.left + svgBounds.width / 2,
                            y: svgBounds.top + svgBounds.height / 2,
                        };
                        const canvasPoint = getCanvasPoint(screenCenter.x, screenCenter.y);
                        const x = canvasPoint.x - img.width / 2;
                        const y = canvasPoint.y - img.height / 2;
                        const newImage: ImageElement = {
                            id: generateId(),
                            type: 'image',
                            x,
                            y,
                            name: imageOutputName,
                            width: img.width,
                            height: img.height,
                            href: `data:${newImageMimeType};base64,${newImageBase64}`,
                            mimeType: newImageMimeType,
                        };
                        commitAction((prev) => [...prev, newImage]);
                        setSelectedElementIds([newImage.id]);
                        saveGenerationToHistory({
                            name: newImage.name,
                            dataUrl: newImage.href,
                            mimeType: newImage.mimeType,
                            width: newImage.width,
                            height: newImage.height,
                            prompt: effectivePrompt,
                        });
                    };
                    img.onerror = () => setError('Failed to load the generated image.');
                    img.src = `data:${newImageMimeType};base64,${newImageBase64}`;
                } else {
                    setError(result.textResponse || 'Generation failed to produce an image.');
                }
            } else {
                // Generate from scratch
                const baseRefs = [...attachmentReferenceImages, ...characterReferenceImages];
                if (baseRefs.length > 0 && !supportsReferenceEditing) {
                    setError(
                        'The current image model does not support reference image generation. Please switch to a Gemini or Imagen image model.',
                    );
                    return;
                }
                const result =
                    baseRefs.length > 0
                        ? await editImage(baseRefs, effectivePrompt)
                        : await generateImageWithProvider(
                              effectivePrompt,
                              modelPreference.imageModel,
                              getPreferredApiKey('image', imageProvider),
                          );

                if (result.newImageBase64 && result.newImageMimeType) {
                    const { newImageBase64, newImageMimeType } = result;

                    const img = new Image();
                    img.onload = () => {
                        if (!svgRef.current) return;
                        const svgBounds = svgRef.current.getBoundingClientRect();
                        const screenCenter = {
                            x: svgBounds.left + svgBounds.width / 2,
                            y: svgBounds.top + svgBounds.height / 2,
                        };
                        const canvasPoint = getCanvasPoint(screenCenter.x, screenCenter.y);
                        const x = canvasPoint.x - img.width / 2;
                        const y = canvasPoint.y - img.height / 2;

                        const newImage: ImageElement = {
                            id: generateId(),
                            type: 'image',
                            x,
                            y,
                            name: imageOutputName,
                            width: img.width,
                            height: img.height,
                            href: `data:${newImageMimeType};base64,${newImageBase64}`,
                            mimeType: newImageMimeType,
                        };
                        commitAction((prev) => [...prev, newImage]);
                        setSelectedElementIds([newImage.id]);
                        saveGenerationToHistory({
                            name: newImage.name,
                            dataUrl: newImage.href,
                            mimeType: newImage.mimeType,
                            width: newImage.width,
                            height: newImage.height,
                            prompt: effectivePrompt,
                        });
                    };
                    img.onerror = () => setError('Failed to load the generated image.');
                    img.src = `data:${newImageMimeType};base64,${newImageBase64}`;
                } else {
                    setError(result.textResponse || 'Generation failed to produce an image.');
                }
            }
        } catch (err) {
            const error = err as Error;
            let friendlyMessage = `Generation error: ${error.message}`;

            if (
                error.message &&
                (error.message.includes('API_KEY_INVALID') || error.message.includes('API key not valid'))
            ) {
                friendlyMessage = 'Invalid API Key. Please check or re-add your API Key in settings.';
            } else if (
                error.message &&
                (error.message.includes('429') || error.message.toUpperCase().includes('RESOURCE_EXHAUSTED'))
            ) {
                friendlyMessage = 'API quota exhausted. Check your Google AI Studio plan or try later.';
            } else if (
                error.message &&
                (error.message.includes('not configured') || error.message.includes('not set'))
            ) {
                friendlyMessage = 'No API Key configured. Open Settings → API Config to add one.';
            }

            setError(friendlyMessage);
            console.error('Generation failed:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return handleGenerate;
}
