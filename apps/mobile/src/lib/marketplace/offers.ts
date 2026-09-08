// Make Offer / Message Seller — both just open the existing direct-conversation
// chat (getOrCreateConversation) and seed the first message so the buyer never
// has to manually identify the listing. No marketplace-specific chat schema:
// negotiation happens entirely inside the existing conversation screen.
import { getOrCreateConversation, sendMessage } from '@/lib/conversationService';
import { formatPriceCents } from './constants';

export async function makeOffer(params: {
  buyerId: string;
  sellerId: string;
  listingTitle: string;
  offerCents: number;
}): Promise<string> {
  const conversationId = await getOrCreateConversation(params.buyerId, params.sellerId);
  const body = `I'd like to offer ${formatPriceCents(params.offerCents)} for your ${params.listingTitle}.`;
  await sendMessage(conversationId, params.buyerId, body);
  return conversationId;
}

export async function messageSellerAboutListing(params: {
  buyerId: string;
  sellerId: string;
  listingTitle: string;
  askingPriceCents: number;
}): Promise<string> {
  const conversationId = await getOrCreateConversation(params.buyerId, params.sellerId);
  const body = `Hi! I'm interested in your listing: ${params.listingTitle} — ${formatPriceCents(params.askingPriceCents)}.`;
  await sendMessage(conversationId, params.buyerId, body);
  return conversationId;
}
