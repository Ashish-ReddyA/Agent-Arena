// Legacy snapshots have no owner and cannot be exposed on a public host.
function retired() {
  return Response.json({ error: "Legacy cloud snapshots are closed. Use Research Arcade private run history; local Docker checkpoints remain in the bridge.", experiments: [] }, { status: 410 });
}
export const GET = retired;
export const POST = retired;
export const DELETE = retired;
