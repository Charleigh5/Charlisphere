/**
 * TextureManager.ts
 * GPU Texture Hydration, HTML5 Canvas 256x256 normalization, and WebGL memory lifecycle.
 */

import * as THREE from 'three';
import { PhotoMemoryItem } from '../types';

export class TextureManager {
  private static textureCache: Map<string, THREE.CanvasTexture> = new Map();
  private static canvasPool: HTMLCanvasElement[] = [];

  /**
   * Acquire a recycled 256x256 HTML Canvas
   */
  private static getCanvas(): HTMLCanvasElement {
    if (this.canvasPool.length > 0) {
      return this.canvasPool.pop()!;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    return canvas;
  }

  /**
   * Generates or retrieves a normalized 256x256 GPU Texture for a PhotoMemoryItem
   */
  public static getTextureForItem(item: PhotoMemoryItem): THREE.CanvasTexture {
    if (this.textureCache.has(item.id)) {
      return this.textureCache.get(item.id)!;
    }

    const canvas = this.getCanvas();
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (ctx) {
      this.renderFallbackCard(ctx, item);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;

    this.textureCache.set(item.id, texture);

    // If real image URL exists, hydrate asynchronously in background
    if (item.thumbnailUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (!ctx) return;
        ctx.clearRect(0, 0, 256, 256);
        
        // Draw photo with cover aspect ratio
        const scale = Math.max(256 / img.width, 256 / img.height);
        const nw = img.width * scale;
        const nh = img.height * scale;
        const ox = (256 - nw) / 2;
        const oy = (256 - nh) / 2;

        try {
          ctx.drawImage(img, ox, oy, nw, nh);
        } catch {
          // Fallback if cross-origin tainted canvas
          this.renderFallbackCard(ctx, item);
        }

        // Elegant bottom gradient for text contrast
        const grad = ctx.createLinearGradient(0, 160, 0, 256);
        grad.addColorStop(0, 'rgba(10, 10, 15, 0)');
        grad.addColorStop(1, 'rgba(10, 10, 15, 0.85)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 160, 256, 96);

        // Title and year badge
        ctx.fillStyle = '#ffffff';
        ctx.font = '600 16px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(item.title.slice(0, 20), 12, 230);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '500 11px "JetBrains Mono", monospace';
        const dateStr = new Date(item.timestamp).getFullYear().toString();
        ctx.fillText(dateStr, 12, 246);

        // Border stroke
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, 254, 254);

        texture.needsUpdate = true;
      };
      img.onerror = () => {
        // Fallback procedural card on error
        if (ctx) {
          this.renderFallbackCard(ctx, item);
          texture.needsUpdate = true;
        }
      };
      img.src = item.thumbnailUrl;
    }

    return texture;
  }

  /**
   * Instant procedural card rendering with vibrant hue gradients
   */
  private static renderFallbackCard(ctx: CanvasRenderingContext2D, item: PhotoMemoryItem): void {
    const hue = item.hue;
    
    // Background dynamic mesh gradient
    const grad = ctx.createRadialGradient(80, 80, 20, 128, 128, 180);
    grad.addColorStop(0, `hsl(${hue}, 85%, 60%)`);
    grad.addColorStop(0.6, `hsl(${(hue + 40) % 360}, 75%, 35%)`);
    grad.addColorStop(1, `hsl(${(hue + 80) % 360}, 90%, 15%)`);
    
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    // Decorative geometric art pattern
    ctx.save();
    ctx.translate(128, 100);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.rotate((Math.PI / 4) * i);
      ctx.strokeRect(-40, -40, 80, 80);
    }
    ctx.restore();

    // Category / Tag pill
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.roundRect(12, 14, 110, 24, 12);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(item.category.slice(0, 14), 22, 30);

    // Bottom dark footer
    const footerGrad = ctx.createLinearGradient(0, 160, 0, 256);
    footerGrad.addColorStop(0, 'rgba(0, 0, 0, 0.2)');
    footerGrad.addColorStop(1, 'rgba(0, 0, 0, 0.9)');
    ctx.fillStyle = footerGrad;
    ctx.fillRect(0, 160, 256, 96);

    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 16px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(item.title.slice(0, 20), 14, 218);

    // Details & Date
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.font = '500 11px "JetBrains Mono", monospace';
    const locShort = (item.exif.locationName || 'Earth').split(',')[0];
    const yearStr = new Date(item.timestamp).getFullYear();
    ctx.fillText(`${locShort} • ${yearStr}`, 14, 238);

    // Card border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 254, 254);
  }

  /**
   * Extract dominant hue and color from a dropped local Image File
   */
  public static async analyzeLocalImage(
    file: File
  ): Promise<{ dataUrl: string; hue: number; dominantColor: string; aspect: number }> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 64;
          canvas.height = 64;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, 64, 64);
            const imgData = ctx.getImageData(0, 0, 64, 64).data;
            let r = 0, g = 0, b = 0, count = 0;
            for (let i = 0; i < imgData.length; i += 16) {
              r += imgData[i];
              g += imgData[i + 1];
              b += imgData[i + 2];
              count++;
            }
            r = Math.floor(r / count);
            g = Math.floor(g / count);
            b = Math.floor(b / count);

            // RGB to HSL Hue
            const rNorm = r / 255;
            const gNorm = g / 255;
            const bNorm = b / 255;
            const max = Math.max(rNorm, gNorm, bNorm);
            const min = Math.min(rNorm, gNorm, bNorm);
            let hue = 0;
            if (max !== min) {
              const d = max - min;
              if (max === rNorm) hue = ((gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0)) * 60;
              else if (max === gNorm) hue = ((bNorm - rNorm) / d + 2) * 60;
              else hue = ((rNorm - gNorm) / d + 4) * 60;
            }
            resolve({
              dataUrl,
              hue: Math.round(hue),
              dominantColor: `rgb(${r}, ${g}, ${b})`,
              aspect: img.width / Math.max(1, img.height),
            });
          } else {
            resolve({ dataUrl, hue: 200, dominantColor: '#38bdf8', aspect: 1.33 });
          }
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * WebGL Memory Lifecycle: Purge all textures and release VRAM
   */
  public static disposeAll(): void {
    for (const texture of this.textureCache.values()) {
      texture.dispose();
    }
    this.textureCache.clear();
    this.canvasPool.length = 0;
  }
}
