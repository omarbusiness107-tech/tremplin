import { drawText, drawTextShadow } from "../../engine/font";
import { VIEW_H, VIEW_W } from "../../engine/canvas";
import { PAL } from "../../content/palette";
import { MAP_LAYOUT, ROOMS } from "../../content/rooms";
import type { Progression } from "../progression";

const MARGIN = 26;

/**
 * Overview of the cathedral. Only rooms you have stood in are drawn; the rest
 * are hinted at by the connections leading off into the dark.
 */
export function drawMapScreen(
  ctx: CanvasRenderingContext2D,
  progression: Progression,
  currentRoom: string,
): void {
  ctx.fillStyle = "rgba(7,5,10,0.93)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  drawTextShadow(ctx, "the cathedral", VIEW_W / 2, 16, PAL.ui, 2, "center");

  const cells = Object.values(MAP_LAYOUT);
  const maxX = Math.max(...cells.map((c) => c.x + c.w));
  const maxY = Math.max(...cells.map((c) => c.y + c.h));
  const scale = Math.min((VIEW_W - MARGIN * 2) / maxX, (VIEW_H - MARGIN * 2 - 26) / maxY);
  const offsetX = (VIEW_W - maxX * scale) / 2;
  const offsetY = 46;

  const px = (v: number): number => Math.round(offsetX + v * scale);
  const py = (v: number): number => Math.round(offsetY + v * scale);

  // Connections first, so room boxes sit on top of them.
  ctx.strokeStyle = PAL.stoneLit;
  ctx.lineWidth = 1;
  for (const room of ROOMS) {
    const from = MAP_LAYOUT[room.id];
    if (!from || !progression.hasVisited(room.id)) continue;
    for (const door of room.doors) {
      const to = MAP_LAYOUT[door.to.room];
      if (!to) continue;
      const known = progression.hasVisited(door.to.room);
      ctx.strokeStyle = known ? PAL.stoneLit : PAL.stoneDark;
      ctx.beginPath();
      ctx.moveTo(px(from.x + from.w / 2), py(from.y + from.h / 2));
      ctx.lineTo(px(to.x + to.w / 2), py(to.y + to.h / 2));
      ctx.stroke();
    }
  }

  for (const room of ROOMS) {
    const cell = MAP_LAYOUT[room.id];
    if (!cell) continue;
    const x = px(cell.x);
    const y = py(cell.y);
    const w = Math.round(cell.w * scale) - 3;
    const h = Math.round(cell.h * scale) - 3;
    const visited = progression.hasVisited(room.id);
    const current = room.id === currentRoom;

    if (!visited) {
      ctx.fillStyle = PAL.stoneDark;
      ctx.globalAlpha = 0.4;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      drawText(ctx, "?", x + w / 2, y + h / 2 - 3, PAL.uiDim, 1, "center");
      continue;
    }

    ctx.fillStyle = current ? PAL.stone : PAL.stoneDark;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = current ? PAL.gold : PAL.stoneLit;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    if (room.boss) {
      ctx.fillStyle = progression.data.bossDefeated ? PAL.stoneLit : PAL.blood;
      ctx.fillRect(x + w / 2 - 2, y + h / 2 - 2, 4, 4);
    }
    if (progression.guilt?.room === room.id) {
      ctx.fillStyle = PAL.guiltPale;
      ctx.fillRect(x + 3, y + 3, 3, 3);
    }
    if (current) {
      ctx.fillStyle = PAL.goldPale;
      ctx.fillRect(x + w / 2 - 1, y + h / 2 - 1, 2, 2);
    }
  }

  const here = ROOMS.find((r) => r.id === currentRoom);
  if (here) drawTextShadow(ctx, here.name, VIEW_W / 2, VIEW_H - 30, PAL.goldPale, 1, "center");

  const d = progression.data;
  drawText(
    ctx,
    `deaths ${d.deaths}   tears ${d.tears}   ${d.abilities.doubleJump ? "breath" : "-"}   ${d.abilities.sealBreaker ? "seal" : "-"}`,
    VIEW_W / 2,
    VIEW_H - 18,
    PAL.uiDim,
    1,
    "center",
  );
  drawText(ctx, "tab to close", VIEW_W / 2, VIEW_H - 9, PAL.uiDim, 1, "center");
}
