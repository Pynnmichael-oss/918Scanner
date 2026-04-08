// Matches the actual live Supabase schema.
// Note: the upsert_property RPC maps p_lat→latitude, p_lng→longitude,
// p_source→source_platform, p_url→source_url internally.

export type ListingType = "sale" | "lease";

export interface Property {
  id: string;
  source_platform: string;
  external_id: string | null;
  source_url: string;
  address: string;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  price: number | null;
  sqft: number | null;
  property_type: string | null;
  listing_type: ListingType | null;
  broker_name: string | null;
  broker_phone: string | null;
  value_score: number;
  first_seen_at: string;
  last_seen_at: string;
  is_active: boolean;
  ai_rationale: string | null;
  ai_flags: string[] | null;
}

export interface Filters {
  propertyType: string;
  listingType: string;
  minPrice: string;
  maxPrice: string;
}
