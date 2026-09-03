import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { experiments } from "../../../db/schema";

function message(error: unknown) { return error instanceof Error ? error.message : "Unexpected storage error"; }

export async function GET() {
  try {
    const rows = await (await getDb()).select().from(experiments).orderBy(desc(experiments.updatedAt)).limit(100);
    return Response.json({ experiments: rows });
  } catch (error) { return Response.json({ error: message(error), experiments: [] }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { id?: string; name?: string; objective?: string; status?: string; payload?: string };
    if (!body.id || !body.name?.trim() || !body.objective?.trim()) return Response.json({ error: "id, name, and objective are required" }, { status: 400 });
    if (typeof body.id !== "string" || body.id.length > 200) return Response.json({ error: "id is invalid" }, { status: 400 });
    if (body.name.length > 300 || body.objective.length > 4000) return Response.json({ error: "name or objective is too long" }, { status: 400 });
    if (body.status && !["draft", "running", "paused", "stopped", "failed", "completed"].includes(body.status)) return Response.json({ error: "status is invalid" }, { status: 400 });
    if (body.payload != null) {
      if (typeof body.payload !== "string" || body.payload.length > 500_000) return Response.json({ error: "payload is too large" }, { status: 413 });
      // Payload is an opaque snapshot, but if it declares an arena id it must be a string.
      try { const parsed = JSON.parse(body.payload) as { arenaId?: unknown }; if (parsed && parsed.arenaId != null && typeof parsed.arenaId !== "string") return Response.json({ error: "payload.arenaId must be a string" }, { status: 400 }); } catch { return Response.json({ error: "payload must be valid JSON" }, { status: 400 }); }
    }
    const db = await getDb();
    await db.insert(experiments).values({ id: body.id, name: body.name.trim(), objective: body.objective.trim(), status: body.status ?? "draft", payload: body.payload ?? "{}" }).onConflictDoUpdate({ target: experiments.id, set: { name: body.name.trim(), objective: body.objective.trim(), status: body.status ?? "draft", payload: body.payload ?? "{}", updatedAt: sql`CURRENT_TIMESTAMP` } });
    const [experiment] = await db.select().from(experiments).where(eq(experiments.id, body.id)).limit(1);
    return Response.json({ experiment }, { status: 201 });
  } catch (error) { return Response.json({ error: message(error) }, { status: 500 }); }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return Response.json({ error: "World id is required" }, { status: 400 });
    const db = await getDb();
    const [existing] = await db.select().from(experiments).where(eq(experiments.id, id)).limit(1);
    if (!existing) return Response.json({ error: "World not found" }, { status: 404 });
    await db.delete(experiments).where(eq(experiments.id, id));
    return Response.json({ ok: true, id });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 500 });
  }
}
