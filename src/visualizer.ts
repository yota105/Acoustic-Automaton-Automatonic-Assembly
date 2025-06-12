import p5 from "p5";
import * as THREE from "three";
import { resumeAudio } from "./audio/audioCore";
import { getCurrentWindow } from '@tauri-apps/api/window';
import "./types/tauri.d.ts";

// グローバルにp5インスタンスを保存
declare global {
  interface Window {
    p5Instance?: p5;
    threeScene?: THREE.Scene;
    threeRenderer?: THREE.WebGLRenderer;
    threeCamera?: THREE.PerspectiveCamera;
  }
}

/* p5.js ビジュアル */
const p5Instance = new p5((p) => {
  let dia = 100;
  p.setup = () => { 
    const canvas = p.createCanvas(800, 600);
    canvas.id('p5-canvas'); // IDを設定
    p.noStroke(); 
  };
  p.draw  = () => {
    p.background(10, 50); // 半透明背景
    p.fill(100, 200, 250, 150); // 半透明の塗り
    p.ellipse(p.width / 2, p.height / 2, dia);
    dia = 75 + 25 * Math.sin(p.frameCount * 0.05);
  };
  p.mousePressed = () => resumeAudio();
}, document.getElementById('visualizer-container') || document.body); // コンテナを指定

// グローバルに保存
window.p5Instance = p5Instance;

/* Three.js ビジュアル初期化 */
function initThreeJS() {
  // シーン、カメラ、レンダラーの初期化
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  
  // canvas要素を取得してレンダラーを初期化
  const canvas = document.getElementById('three-canvas') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ 
    canvas: canvas, 
    alpha: true // 透明背景を有効にする
  });
  
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0); // 透明背景
  
  // 基本的なジオメトリとマテリアルを作成
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
  const cube = new THREE.Mesh(geometry, material);
  scene.add(cube);
  
  camera.position.z = 5;
  
  // グローバルに保存
  window.threeScene = scene;
  window.threeRenderer = renderer;
  window.threeCamera = camera;
  
  // アニメーションループ
  function animate() {
    requestAnimationFrame(animate);
    
    // キューブを回転させる
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;
    
    renderer.render(scene, camera);
  }
  animate();
  
  // ウィンドウリサイズ対応
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  
  console.log("[VISUALIZER] Three.js initialized");
}

// Three.jsを初期化
initThreeJS();

// Tauriイベントリスナーの設定
async function setupTauriListeners() {
  if (typeof window.__TAURI__ !== 'undefined' && window.__TAURI__.event) {
    try {
      await window.__TAURI__.event.listen('visualizer-command', (event: any) => {
        console.log("[VISUALIZER] Received Tauri event:", event.payload);
        handleVisualizerCommand(event.payload);
      });
      console.log("[VISUALIZER] Tauri event listener setup complete");
    } catch (error) {
      console.log("[VISUALIZER] Failed to setup Tauri event listener:", error);
    }
  } else {
    console.log("[VISUALIZER] Tauri API not available, using postMessage fallback");
  }
}

// ビジュアライザーコマンドを処理する共通関数
async function handleVisualizerCommand(msg: any) {
  if (!msg || typeof msg !== "object" || !msg.type) {
    console.log("[VISUALIZER] Invalid message format");
    return;
  }
  
  console.log(`[VISUALIZER] Processing command: ${msg.type}`);
  
  // Tauriネイティブウィンドウ制御を試行
  const isTauriEnv = typeof window.__TAURI__ !== 'undefined';
  let currentWindow: any = null;
  
  if (isTauriEnv) {
    try {
      currentWindow = getCurrentWindow();
    } catch (error) {
      console.log("[VISUALIZER] Failed to get current window:", error);
    }
  }
  
  const canvas = document.querySelector("canvas");
  if (!canvas) {
    console.log("[VISUALIZER] Canvas not found");
    return;
  }
  
  switch (msg.type) {
    case "toggle-visibility":
      if (currentWindow) {
        try {
          const isVisible = await currentWindow.isVisible();
          if (isVisible) {
            await currentWindow.hide();
            console.log("[VISUALIZER] Window hidden via Tauri API");
          } else {
            await currentWindow.show();
            console.log("[VISUALIZER] Window shown via Tauri API");
          }
        } catch (error) {
          console.log("[VISUALIZER] Tauri visibility toggle failed, using fallback:", error);
          canvas.style.display = (canvas.style.display === "none") ? "block" : "none";
        }
      } else {
        canvas.style.display = (canvas.style.display === "none") ? "block" : "none";
        console.log(`[VISUALIZER] Visibility toggled: ${canvas.style.display}`);
      }
      break;
      
    case "toggle-border":
      if (currentWindow) {
        try {
          const isDecorated = await currentWindow.isDecorated();
          await currentWindow.setDecorations(!isDecorated);
          console.log(`[VISUALIZER] Window decorations toggled via Tauri API: ${!isDecorated}`);
        } catch (error) {
          console.log("[VISUALIZER] Tauri decoration toggle failed, using fallback:", error);
          canvas.style.border = (canvas.style.border === "2px solid #333") ? "none" : "2px solid #333";
        }
      } else {
        canvas.style.border = (canvas.style.border === "2px solid #333") ? "none" : "2px solid #333";
        console.log(`[VISUALIZER] Border toggled: ${canvas.style.border}`);
      }
      break;
      
    case "toggle-maximize":
      if (currentWindow) {
        try {
          const isMaximized = await currentWindow.isMaximized();
          if (isMaximized) {
            await currentWindow.unmaximize();
            console.log("[VISUALIZER] Window unmaximized via Tauri API");
          } else {
            await currentWindow.maximize();
            console.log("[VISUALIZER] Window maximized via Tauri API");
          }
        } catch (error) {
          console.log("[VISUALIZER] Tauri maximize toggle failed, using fallback:", error);
          // フォールバック: CSS最大化
          if (canvas.style.position !== "fixed") {
            canvas.style.position = "fixed";
            canvas.style.left = "0";
            canvas.style.top = "0";
            canvas.style.width = "100vw";
            canvas.style.height = "100vh";
            canvas.style.zIndex = "1000";
            canvas.style.border = "none";
            console.log("[VISUALIZER] CSS Maximized");
          } else {
            canvas.style.position = "";
            canvas.style.left = "";
            canvas.style.top = "";
            canvas.style.width = "800px";
            canvas.style.height = "600px";
            canvas.style.zIndex = "";
            canvas.style.border = "2px solid #333";
            console.log("[VISUALIZER] CSS Restored to normal size");
          }
        }
      } else {
        // フォールバック処理
        if (canvas.style.position !== "fixed") {
          canvas.style.position = "fixed";
          canvas.style.left = "0";
          canvas.style.top = "0";
          canvas.style.width = "100vw";
          canvas.style.height = "100vh";
          canvas.style.zIndex = "1000";
          canvas.style.border = "none";
          console.log("[VISUALIZER] Maximized");
        } else {
          canvas.style.position = "";
          canvas.style.left = "";
          canvas.style.top = "";
          canvas.style.width = "800px";
          canvas.style.height = "600px";
          canvas.style.zIndex = "";
          canvas.style.border = "2px solid #333";
          console.log("[VISUALIZER] Restored to normal size");
        }
      }
      break;
      
    case "fullscreen":
      if (currentWindow) {
        try {
          const isFullscreen = await currentWindow.isFullscreen();
          await currentWindow.setFullscreen(!isFullscreen);
          console.log(`[VISUALIZER] Fullscreen toggled via Tauri API: ${!isFullscreen}`);
        } catch (error) {
          console.log("[VISUALIZER] Tauri fullscreen failed, using fallback:", error);
          if (canvas.requestFullscreen) {
            canvas.requestFullscreen();
            console.log("[VISUALIZER] Fullscreen requested via DOM API");
          }
        }
      } else {
        if (canvas.requestFullscreen) {
          canvas.requestFullscreen();
          console.log("[VISUALIZER] Fullscreen requested");
        }
      }
      break;
      
    case "borderless-maximize":
      if (currentWindow) {
        try {
          await currentWindow.setDecorations(false);
          await currentWindow.maximize();
          console.log("[VISUALIZER] Borderless maximize via Tauri API");
        } catch (error) {
          console.log("[VISUALIZER] Tauri borderless maximize failed, using fallback:", error);
          canvas.style.position = "fixed";
          canvas.style.left = "0";
          canvas.style.top = "0";
          canvas.style.width = "100vw";
          canvas.style.height = "100vh";
          canvas.style.zIndex = "1000";
          canvas.style.border = "none";
        }
      } else {
        canvas.style.position = "fixed";
        canvas.style.left = "0";
        canvas.style.top = "0";
        canvas.style.width = "100vw";
        canvas.style.height = "100vh";
        canvas.style.zIndex = "1000";
        canvas.style.border = "none";
        console.log("[VISUALIZER] Borderless maximize applied");
      }
      break;
      
    case "maximize":
      if (currentWindow) {
        try {
          await currentWindow.maximize();
          console.log("[VISUALIZER] Window maximized via Tauri API");
        } catch (error) {
          console.log("[VISUALIZER] Tauri maximize failed, using fallback:", error);
          canvas.style.position = "fixed";
          canvas.style.left = "0";
          canvas.style.top = "0";
          canvas.style.width = "100vw";
          canvas.style.height = "100vh";
          canvas.style.zIndex = "1000";
          canvas.style.border = "none";
        }
      } else {
        canvas.style.position = "fixed";
        canvas.style.left = "0";
        canvas.style.top = "0";
        canvas.style.width = "100vw";
        canvas.style.height = "100vh";
        canvas.style.zIndex = "1000";
        canvas.style.border = "none";
        console.log("[VISUALIZER] Maximize applied");
      }
      break;
      
    case "normal":
      if (currentWindow) {
        try {
          await currentWindow.unmaximize();
          await currentWindow.setFullscreen(false);
          await currentWindow.setDecorations(true);
          console.log("[VISUALIZER] Window restored to normal via Tauri API");
        } catch (error) {
          console.log("[VISUALIZER] Tauri normal restore failed, using fallback:", error);
          canvas.style.position = "";
          canvas.style.left = "";
          canvas.style.top = "";
          canvas.style.width = "800px";
          canvas.style.height = "600px";
          canvas.style.zIndex = "";
          canvas.style.border = msg.borderless ? "none" : "2px solid #333";
        }
      } else {
        canvas.style.position = "";
        canvas.style.left = "";
        canvas.style.top = "";
        canvas.style.width = "800px";
        canvas.style.height = "600px";
        canvas.style.zIndex = "";
        canvas.style.border = msg.borderless ? "none" : "2px solid #333";
        console.log("[VISUALIZER] Normal size restored");
      }
      break;
      
    case "resize":
      if (msg.width && msg.height) {
        const width = parseInt(msg.width.replace('px', ''));
        const height = parseInt(msg.height.replace('px', ''));
        
        if (currentWindow) {
          try {
            await currentWindow.setSize({ width, height });
            console.log(`[VISUALIZER] Window resized via Tauri API to ${width}x${height}`);
          } catch (error) {
            console.log("[VISUALIZER] Tauri resize failed, using fallback:", error);
            canvas.style.width = msg.width;
            canvas.style.height = msg.height;
          }
        } else {
          canvas.style.width = msg.width;
          canvas.style.height = msg.height;
        }
          // p5インスタンスのキャンバスもリサイズ
        if (window.p5Instance) {
          window.p5Instance.resizeCanvas(width, height);
          console.log(`[VISUALIZER] p5 canvas resized to ${width}x${height}`);
        }
      }
      break;
      
    case "minimize":
      if (currentWindow) {
        try {
          await currentWindow.minimize();
          console.log("[VISUALIZER] Window minimized via Tauri API");
        } catch (error) {
          console.log("[VISUALIZER] Tauri minimize failed:", error);
        }
      } else {
        console.log("[VISUALIZER] Minimize not available in browser mode");
      }
      break;
      
    case "restore-normal":
      if (currentWindow) {
        try {
          await currentWindow.unmaximize();
          await currentWindow.setFullscreen(false);
          await currentWindow.setDecorations(true);
          await currentWindow.show();
          console.log("[VISUALIZER] Window restored to normal via Tauri API");
        } catch (error) {
          console.log("[VISUALIZER] Tauri restore failed, using fallback:", error);
          canvas.style.position = "";
          canvas.style.left = "";
          canvas.style.top = "";
          canvas.style.width = "800px";
          canvas.style.height = "600px";
          canvas.style.zIndex = "";
          canvas.style.border = "2px solid #333";
        }
      } else {
        canvas.style.position = "";
        canvas.style.left = "";
        canvas.style.top = "";
        canvas.style.width = "800px";
        canvas.style.height = "600px";
        canvas.style.zIndex = "";
        canvas.style.border = "2px solid #333";
        console.log("[VISUALIZER] Restored to normal size");
      }
      break;
      
    case "center":
      if (currentWindow) {
        try {
          await currentWindow.center();
          console.log("[VISUALIZER] Window centered via Tauri API");
        } catch (error) {
          console.log("[VISUALIZER] Tauri center failed:", error);
        }
      } else {
        console.log("[VISUALIZER] Center not available in browser mode");
      }
      break;
      
    case "toggle-always-on-top":
      if (currentWindow) {
        try {
          const isAlwaysOnTop = await currentWindow.isAlwaysOnTop();
          await currentWindow.setAlwaysOnTop(!isAlwaysOnTop);
          console.log(`[VISUALIZER] Always on top toggled via Tauri API: ${!isAlwaysOnTop}`);
        } catch (error) {
          console.log("[VISUALIZER] Tauri always on top toggle failed:", error);
        }
      } else {
        console.log("[VISUALIZER] Always on top not available in browser mode");
      }
      break;
      
    default:
      console.log(`[VISUALIZER] Unknown command: ${msg.type}`);
  }
}

// Tauriリスナーを初期化
setupTauriListeners();

// postMessageでコントローラーからの指示を受信（フォールバック用）
window.addEventListener("message", (event) => {
  console.log("[VISUALIZER] Received postMessage:", event.data);
  // 共通のハンドラーを使用
  handleVisualizerCommand(event.data);
});