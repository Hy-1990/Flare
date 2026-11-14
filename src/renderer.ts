import { drawFilm, preload } from "../shared/film.js";
const canvas = document.querySelector("canvas")!;
declare global {
  interface Window {
    flareRenderer: {
      setProject: (p: any, w: number, h: number) => Promise<void>;
      render: (t: number) => void;
    };
  }
}
let project: any;
window.flareRenderer = {
  async setProject(p, w, h) {
    project = p;
    canvas.width = w;
    canvas.height = h;
    await preload(p);
    await document.fonts.ready;
    drawFilm(canvas, p, 0);
  },
  render(t) {
    drawFilm(canvas, project, t);
  },
};
