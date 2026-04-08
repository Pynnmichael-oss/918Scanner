export type ListingType = "sale" | "lease";

export interface Property {
  id: string;
  source: string;
  external_id: string;
  url: string;
  address: string;
  lat: number;
  lng: number;
  price: number | null;
  sqft: number | null;
  property_type: string | null;
  listing_type: ListingType | null;
  broker_name: string | null;
  broker_phone: string | null;
  value_score: number;
  scraped_at: string;
  created_at: string;
}

export interface Filters {
  propertyType: string;
  listingType: string;
  minPrice: string;
  maxPrice: string;
}
