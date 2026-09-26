import wordmarkUrl from "../../assets/logo-wordmark-black.png";

/**
 * The design estimate sheet: a PNG the artist can hand to a client.
 *
 * Composed on a 2D canvas from a render of the current view and the list of
 * pieces. It takes every label and every formatted amount ready-made, so the
 * sheet is in the customer's language and currency format without this module
 * knowing about either. The amounts are an indicative estimate (see
 * `ESTIMATE_PRICING`), and the sheet says so in its footer.
 */

export interface QuoteRow {
  name: string;
  tooth: string;
  size: string;
  finish: string;
  price: string;
}

export interface QuoteSheetInput {
  renderURL: string;
  clientName: string;
  rows: QuoteRow[];
  total: string;
  labels: {
    title: string;
    date: string;
    client: string;
    piece: string;
    tooth: string;
    size: string;
    finish: string;
    price: string;
    total: string;
    footer: string;
  };
}

/* Brand palette, as in `index.css` (a canvas cannot read CSS variables). */
const INK_900 = "#111111";
const INK_500 = "#5c5c5c";
const INK_400 = "#8a8a8a";
const INK_200 = "#e4e3df";
const BLUE_50 = "#f4f8fc";
const BLUE_100 = "#e7eef7";
const BLUE_600 = "#5a7796";
const OFF_WHITE = "#fafaf8";
const FONT = 'Montserrat, "Helvetica Neue", Arial, sans-serif';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

/** Draw `text` shortened with an ellipsis so it never runs into the next column. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

export async function buildQuoteSheetDataURL(input: QuoteSheetInput): Promise<string> {
  const { labels, rows } = input;
  const [render, wordmark] = await Promise.all([loadImage(input.renderURL), loadImage(wordmarkUrl).catch(() => null)]);
  const W = 1240;
  const M = 70;
  const renderW = W - M * 2;
  const renderH = Math.min(620, Math.max(300, Math.round(renderW * (render.height / render.width))));
  const rowH = 44;
  const H = Math.max(1240, 210 + 60 + renderH + 46 + 46 + rows.length * rowH + 96 + 70);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d")!;

  // Page and header band
  x.fillStyle = OFF_WHITE;
  x.fillRect(0, 0, W, H);
  x.fillStyle = BLUE_100;
  x.fillRect(0, 0, W, 132);
  if (wordmark) {
    const h = 30;
    x.drawImage(wordmark, M, 51, (wordmark.width / wordmark.height) * h, h);
  } else {
    x.fillStyle = INK_900;
    x.font = `800 30px ${FONT}`;
    x.fillText("Global Toothgems", M, 76);
  }
  x.fillStyle = BLUE_600;
  x.font = `700 12px ${FONT}`;
  x.fillText("STUDIO 3D", M, 106);
  x.textAlign = "right";
  x.fillStyle = INK_900;
  x.font = `800 15px ${FONT}`;
  x.fillText(labels.title.toUpperCase(), W - M, 66);
  x.fillStyle = INK_500;
  x.font = `500 14px ${FONT}`;
  x.fillText(labels.date, W - M, 92);
  x.textAlign = "left";

  // Client line
  let y = 182;
  x.fillStyle = INK_400;
  x.font = `800 11px ${FONT}`;
  x.fillText(labels.client.toUpperCase(), M, y);
  const clientLabelW = x.measureText(labels.client.toUpperCase()).width;
  x.fillStyle = INK_900;
  x.font = `600 24px ${FONT}`;
  x.fillText(fitText(x, input.clientName.trim() || "—", renderW - clientLabelW - 24), M + clientLabelW + 24, y + 1);

  // Render of the current view
  y += 36;
  x.drawImage(render, M, y, renderW, renderH);
  x.strokeStyle = INK_200;
  x.lineWidth = 1;
  x.strokeRect(M + 0.5, y + 0.5, renderW - 1, renderH - 1);

  // Piece table
  y += renderH + 44;
  const cols = { idx: M, name: M + 52, tooth: M + 470, size: M + 560, finish: M + 690, price: W - M };
  x.font = `800 11px ${FONT}`;
  x.fillStyle = INK_400;
  x.fillText("#", cols.idx, y);
  x.fillText(labels.piece.toUpperCase(), cols.name, y);
  x.fillText(labels.tooth.toUpperCase(), cols.tooth, y);
  x.fillText(labels.size.toUpperCase(), cols.size, y);
  x.fillText(labels.finish.toUpperCase(), cols.finish, y);
  x.textAlign = "right";
  x.fillText(labels.price.toUpperCase(), cols.price, y);
  x.textAlign = "left";
  y += 14;
  x.strokeStyle = BLUE_600;
  x.beginPath();
  x.moveTo(M, y + 0.5);
  x.lineTo(W - M, y + 0.5);
  x.stroke();
  y += 8;
  rows.forEach((r, i) => {
    if (i % 2 === 1) {
      x.fillStyle = BLUE_50;
      x.fillRect(M - 12, y, W - 2 * M + 24, rowH);
    }
    const ty = y + 28;
    x.fillStyle = INK_900;
    x.font = `600 17px ${FONT}`;
    x.fillText(String(i + 1).padStart(2, "0"), cols.idx, ty);
    x.fillText(fitText(x, r.name, cols.tooth - cols.name - 16), cols.name, ty);
    x.fillText(r.tooth, cols.tooth, ty);
    x.fillText(r.size, cols.size, ty);
    x.fillStyle = INK_500;
    x.fillText(fitText(x, r.finish, cols.price - cols.finish - 110), cols.finish, ty);
    x.fillStyle = INK_900;
    x.textAlign = "right";
    x.fillText(r.price, cols.price, ty);
    x.textAlign = "left";
    y += rowH;
    x.strokeStyle = INK_200;
    x.beginPath();
    x.moveTo(M, y + 0.5);
    x.lineTo(W - M, y + 0.5);
    x.stroke();
  });

  // Total
  y += 20;
  x.font = `700 15px ${FONT}`;
  x.fillStyle = INK_500;
  x.fillText(labels.total.toUpperCase(), M, y + 6);
  x.font = `800 34px ${FONT}`;
  x.fillStyle = INK_900;
  x.textAlign = "right";
  x.fillText(input.total, W - M, y + 10);
  x.textAlign = "left";
  y += 44;
  x.strokeStyle = BLUE_600;
  x.beginPath();
  x.moveTo(M, y + 0.5);
  x.lineTo(W - M, y + 0.5);
  x.stroke();

  // Footer
  x.font = `500 12px ${FONT}`;
  x.fillStyle = INK_400;
  x.fillText(fitText(x, labels.footer, renderW), M, y + 32);
  return c.toDataURL("image/png");
}
