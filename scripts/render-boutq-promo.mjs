import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const outputDir = resolve(root, "artifacts", "marketing");
mkdirSync(outputDir, { recursive: true });

const scenes = [
  {
    image: "C:/Users/TCIG-S~1/AppData/Local/Temp/codex-clipboard-3711deee-3b04-41fc-aa10-064bc8a219e3.png",
    eyebrow: "كل أعمالك في مكان واحد",
    title: "مشتّت بين أنظمة كثيرة؟",
    body: "Boutq OS يجمع إدارة المتجر والطلبات والعملاء والمخزون في تجربة واحدة.",
    duration: 8,
  },
  {
    image: "C:/Users/TCIG-S~1/AppData/Local/Temp/codex-clipboard-006b3785-b92a-401f-b6dd-9cce2118b230.png",
    eyebrow: "واجهة متجر سريعة ومتناسقة",
    title: "متجر جاهز للبيع",
    body: "تجربة شراء احترافية على الهاتف والكمبيوتر، مع خيارات التفصيل وPura Fit Passport.",
    duration: 10,
  },
  {
    image: "C:/Users/TCIG-S~1/AppData/Local/Temp/codex-clipboard-45958541-2d85-4dde-bbd4-1d4235ee48d0.png",
    eyebrow: "محتوى يولد من تجربة العميل",
    title: "حوّل التقييم إلى ستوري",
    body: "تصاميم جاهزة للنشر تحفظ هوية البراند وتحوّل آراء العملاء إلى محتوى مؤثر.",
    duration: 10,
  },
  {
    image: "C:/Users/TCIG-S~1/AppData/Local/Temp/codex-clipboard-8afa931b-df24-4f7c-8605-76dc43f48ae5.png",
    eyebrow: "Pura Content Studio",
    title: "صمّم محتواك من داخل النظام",
    body: "صور منتجات، نصوص، أسعار، وهوية بصرية في تصميم احترافي جاهز للتصدير.",
    duration: 10,
  },
  {
    image: "C:/Users/TCIG-S~1/AppData/Local/Temp/codex-clipboard-a2fdae82-10f0-4e80-91df-643e14646eeb.png",
    eyebrow: "تخصيص مرن لكل منتج",
    title: "مقاسات وخيارات بلا فوضى",
    body: "اربط المنتج بملف العباية أو الفستان، واحفظ المقاسات لتظهر مرتبة في الطلب والإدارة.",
    duration: 10,
  },
  {
    image: "C:/Users/TCIG-S~1/AppData/Local/Temp/codex-clipboard-3711deee-3b04-41fc-aa10-064bc8a219e3.png",
    eyebrow: "Boutq OS",
    title: "امتلك نظامك الخاص",
    body: "تجارة إلكترونية متكاملة، بياناتك بين يديك، وتجربة تحمل هوية البراند.",
    cta: "ابدأ اليوم  •  boutq.store",
    duration: 12,
  },
];

const encodedScenes = scenes.map((scene) => ({
  ...scene,
  image: `data:image/png;base64,${readFileSync(scene.image).toString("base64")}`,
}));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
const chunks = [];
await page.exposeFunction("saveVideoChunk", (base64) => chunks.push(Buffer.from(base64, "base64")));
await page.setContent(`<!doctype html><html lang="ar" dir="rtl"><body style="margin:0"><canvas id="c" width="1080" height="1920"></canvas></body></html>`);
await page.evaluate(async (scenes) => {
  const canvas = document.querySelector("#c");
  const ctx = canvas.getContext("2d");
  const images = await Promise.all(scenes.map((scene) => new Promise((done) => {
    const image = new Image(); image.onload = () => done(image); image.src = scene.image;
  })));
  const stream = canvas.captureStream(30);
  const mimeType = MediaRecorder.isTypeSupported("video/mp4;codecs=avc1.42E01E") ? "video/mp4;codecs=avc1.42E01E" : "video/webm;codecs=vp9";
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  recorder.ondataavailable = async (event) => {
    if (!event.data.size) return;
    const bytes = new Uint8Array(await event.data.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    await window.saveVideoChunk(btoa(binary));
  };
  const roundedRect = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  const wrap = (text, maxWidth) => {
    const words = text.split(" "); const lines = []; let line = "";
    for (const word of words) { const test = line ? `${line} ${word}` : word; if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test; }
    if (line) lines.push(line); return lines;
  };
  const total = scenes.reduce((sum, scene) => sum + scene.duration, 0);
  let elapsed = 0;
  recorder.start(1000);
  const started = performance.now();
  await new Promise((finish) => {
    const draw = (now) => {
      const time = Math.min((now - started) / 1000, total);
      let index = 0; let localStart = 0;
      for (let i = 0, cursor = 0; i < scenes.length; i++) { if (time < cursor + scenes[i].duration || i === scenes.length - 1) { index = i; localStart = cursor; break; } cursor += scenes[i].duration; }
      const scene = scenes[index]; const image = images[index]; const local = time - localStart; const progress = Math.max(0, Math.min(1, local / scene.duration));
      const fade = Math.min(1, local / .6, (scene.duration - local) / .6);
      const gradient = ctx.createLinearGradient(0, 0, 1080, 1920); gradient.addColorStop(0, "#160707"); gradient.addColorStop(.55, "#330a0a"); gradient.addColorStop(1, "#090303"); ctx.fillStyle = gradient; ctx.fillRect(0,0,1080,1920);
      ctx.save(); ctx.globalAlpha = .12; ctx.fillStyle = "#d7b98e"; ctx.beginPath(); ctx.arc(110, 250, 310, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(1030, 1520, 430, 0, Math.PI*2); ctx.fill(); ctx.restore();
      ctx.globalAlpha = fade;
      ctx.fillStyle = "#f4e7d3"; ctx.font = "700 28px Arial"; ctx.textAlign = "right"; ctx.fillText("BOUTQ OS", 970, 92);
      ctx.fillStyle = "rgba(244,231,211,.72)"; ctx.font = "600 22px Arial"; ctx.fillText(scene.eyebrow, 970, 180);
      ctx.fillStyle = "#ffffff"; ctx.font = "700 62px Arial"; const titleLines = wrap(scene.title, 900); titleLines.forEach((line,i) => ctx.fillText(line,970,270+i*78));
      ctx.save(); roundedRect(75, 440, 930, 1050, 44); ctx.clip();
      const baseScale = Math.max(930/image.width, 1050/image.height); const zoom = baseScale * (1 + progress * .07); const dw=image.width*zoom, dh=image.height*zoom; const dx=75+(930-dw)/2 + Math.sin(progress*Math.PI)*22; const dy=440+(1050-dh)/2 - progress*24; ctx.drawImage(image,dx,dy,dw,dh); ctx.restore();
      ctx.strokeStyle = "rgba(244,231,211,.45)"; ctx.lineWidth=3; roundedRect(75,440,930,1050,44); ctx.stroke();
      const panelY=1540; ctx.fillStyle="rgba(255,255,255,.95)"; roundedRect(75,panelY,930,scene.cta?280:235,38); ctx.fill();
      ctx.fillStyle="#330a0a"; ctx.font="600 34px Arial"; const bodyLines=wrap(scene.body,820); bodyLines.forEach((line,i)=>ctx.fillText(line,950,panelY+70+i*50));
      if(scene.cta){ctx.fillStyle="#330a0a"; roundedRect(390,panelY+185,560,68,34);ctx.fill();ctx.fillStyle="#fff";ctx.font="700 28px Arial";ctx.textAlign="center";ctx.fillText(scene.cta,670,panelY+230);ctx.textAlign="right";}
      ctx.globalAlpha=1; ctx.fillStyle="rgba(255,255,255,.2)";ctx.fillRect(75,1872,930,6);ctx.fillStyle="#d7b98e";ctx.fillRect(75,1872,930*(time/total),6);
      ctx.fillStyle="rgba(255,255,255,.7)";ctx.font="600 20px Arial";ctx.textAlign="left";ctx.fillText(`${String(index+1).padStart(2,"0")} / ${String(scenes.length).padStart(2,"0")}`,75,1835);
      ctx.textAlign="right";
      if(time < total) requestAnimationFrame(draw); else finish();
    }; requestAnimationFrame(draw);
  });
  await new Promise((done) => { recorder.onstop = done; recorder.stop(); });
}, encodedScenes);
await browser.close();
const output = resolve(outputDir, "boutq-os-promo-silent-vertical.mp4");
writeFileSync(output, Buffer.concat(chunks));
console.log(output);
