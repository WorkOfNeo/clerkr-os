export type RoadmapLane = "NOW" | "NEXT" | "LATER";

export const ROADMAP_LANES: { id: RoadmapLane; label: string; color: string }[] = [
  { id: "NOW", label: "Now", color: "#22c55e" },
  { id: "NEXT", label: "Next", color: "#3b82f6" },
  { id: "LATER", label: "Later", color: "#a855f7" },
];

export interface RoadmapFeature {
  id: string;
  slug: string;
  title: string;
}

export interface RoadmapCardItem {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  lane: RoadmapLane;
  order: number;
  confidence: number;
  themeTag: string | null;
  blocked: boolean;
  blockerNote: string | null;
  featureId: string | null;
  feature: RoadmapFeature | null;
}
