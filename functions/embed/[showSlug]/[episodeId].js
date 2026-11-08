import { handleEmbedRequest } from './index.js';

export async function onRequest(context) {
  const showSlug = context.params && context.params.showSlug;
  const episodeId = context.params && context.params.episodeId;
  return handleEmbedRequest(context, showSlug, episodeId);
}
