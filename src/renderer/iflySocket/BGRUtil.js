const { createCanvas } = require('canvas');

class BGRUtil {
  static drawFaceLine(canvas, imgWidth, imgHeight, x, y, w, h) {
    const ctx = canvas.getContext('2d');
    const color = '#0000FF';
    const borderWidth = 10;

    x = Math.max(0, x);
    y = Math.max(0, y);
    if (x + w > imgWidth) w = imgWidth - x;
    if (y + h > imgHeight) h = imgHeight - y;

    ctx.strokeStyle = color;
    ctx.lineWidth = borderWidth;
    ctx.strokeRect(x, y, w, h);
  }
}

module.exports = BGRUtil;
