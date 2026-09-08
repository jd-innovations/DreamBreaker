import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { OG_ENTITY_TYPES, type OgEntityType } from "@/lib/og/types";
import { fetchOgPayload } from "@/lib/og/fetchers";

export const runtime = "nodejs";

const ENTITY_LABEL: Record<OgEntityType, string> = {
  tournament: "TOURNAMENT",
  community: "COMMUNITY PLAY",
  marketplace: "MARKETPLACE",
  group: "GROUP",
  coach: "COACH",
  facility: "FACILITY",
};

const NAVY = "#0A1228";
const GOLD = "#C9A84C";

// The card rendered when there's no cover photo to use directly, AND the
// generic safe fallback for anything fetchOgPayload can't (or won't) describe
// — missing, private, inactive, cancelled, or deleted. Both paths render
// through this same template; the only difference is whether `payload` is
// null, which controls whether the entity's own title/detail line appear at
// all. A crawler must never be able to tell "no cover photo" apart from
// "content moderated away" from this image alone.
function branded(typeLabel: string | null, title: string | null, detail: string | null) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: `linear-gradient(135deg, ${NAVY} 0%, #162041 100%)`,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "40px" }}>
          <div
            style={{
              width: "14px",
              height: "14px",
              borderRadius: "999px",
              background: GOLD,
              display: "flex",
            }}
          />
          <span style={{ color: GOLD, fontSize: "28px", fontWeight: 800, letterSpacing: "4px" }}>
            PICKLEBALL APP
          </span>
        </div>

        {typeLabel && (
          <span
            style={{
              color: GOLD,
              fontSize: "24px",
              fontWeight: 700,
              letterSpacing: "3px",
              marginBottom: "18px",
              display: "flex",
            }}
          >
            {typeLabel}
          </span>
        )}

        <span
          style={{
            color: "#FFFFFF",
            fontSize: title && title.length > 40 ? "56px" : "68px",
            fontWeight: 800,
            lineHeight: 1.15,
            display: "flex",
            maxWidth: "1000px",
          }}
        >
          {title ?? "Pickleball App"}
        </span>

        {detail && (
          <span
            style={{
              color: "rgba(255,255,255,0.75)",
              fontSize: "30px",
              fontWeight: 500,
              marginTop: "26px",
              display: "flex",
            }}
          >
            {detail}
          </span>
        )}

        {!title && (
          <span
            style={{
              color: "rgba(255,255,255,0.7)",
              fontSize: "30px",
              fontWeight: 500,
              marginTop: "10px",
              display: "flex",
            }}
          >
            Tournaments · Community Play · Coaching · Facilities
          </span>
        )}
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const { type, id } = await params;

  if (!OG_ENTITY_TYPES.includes(type as OgEntityType)) {
    return branded(null, null, null);
  }

  const payload = await fetchOgPayload(type as OgEntityType, id);
  if (!payload) {
    // Not found / private / inactive / cancelled / deleted — generic branded
    // card, no entity data. See the comment on branded() above.
    return branded(null, null, null);
  }

  return branded(ENTITY_LABEL[payload.entityType], payload.title, payload.detailLine);
}
