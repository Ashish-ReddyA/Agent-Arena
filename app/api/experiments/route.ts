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
