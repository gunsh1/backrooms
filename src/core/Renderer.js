// =============================================================
//  Renderer.js — WebGLRenderer とシーン基盤（霧・露出・トーンマップ）
// =============================================================

import * as THREE from 'three';
import { CONFIG } from '../config.js';

export class Renderer {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    // シャドウ（柔らかいPCF）
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // シーン
    this.scene = new THREE.Scene();
    const fogColor = new THREE.Color(CONFIG.light.fogColor);
    this.scene.fog = new THREE.Fog(fogColor, CONFIG.light.fogNear, CONFIG.light.fogFar);
    this.scene.background = fogColor.clone().multiplyScalar(0.5);

    // カメラ
    this.camera = new THREE.PerspectiveCamera(
      72, window.innerWidth / window.innerHeight, 0.05, 120);
    this.scene.add(this.camera);
  }

  setSize(w, h) {
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
