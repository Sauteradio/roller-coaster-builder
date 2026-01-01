import { create } from "zustand";
import * as THREE from "three";

export type CoasterMode = "build" | "ride" | "preview";

export interface TrackPoint {
  id: string;
  position: THREE.Vector3;
  tilt: number;
}

interface RollerCoasterState {
  mode: CoasterMode;
  trackPoints: TrackPoint[];
  selectedPointId: string | null;
  rideProgress: number;
  isRiding: boolean;
  rideSpeed: number;
  isDraggingPoint: boolean;
  isAddingPoints: boolean;
  isLooped: boolean;
  hasChainLift: boolean;
  showWoodSupports: boolean;
  isNightMode: boolean;
  cameraTarget: THREE.Vector3 | null;
  
  setMode: (mode: CoasterMode) => void;
  setCameraTarget: (target: THREE.Vector3 | null) => void;
  addTrackPoint: (position: THREE.Vector3) => void;
  updateTrackPoint: (id: string, position: THREE.Vector3) => void;
  updateTrackPointTilt: (id: string, tilt: number) => void;
  removeTrackPoint: (id: string) => void;
  createLoopAtPoint: (id: string) => void;
  selectPoint: (id: string | null) => void;
  clearTrack: () => void;
  setRideProgress: (progress: number) => void;
  setIsRiding: (riding: boolean) => void;
  setRideSpeed: (speed: number) => void;
  setIsDraggingPoint: (dragging: boolean) => void;
  setIsAddingPoints: (adding: boolean) => void;
  setIsLooped: (looped: boolean) => void;
  setHasChainLift: (hasChain: boolean) => void;
  setShowWoodSupports: (show: boolean) => void;
  setIsNightMode: (night: boolean) => void;
  startRide: () => void;
  stopRide: () => void;
}

let pointCounter = 0;

export const useRollerCoaster = create<RollerCoasterState>((set, get) => ({
  mode: "build",
  trackPoints: [],
  selectedPointId: null,
  rideProgress: 0,
  isRiding: false,
  rideSpeed: 1.0,
  isDraggingPoint: false,
  isAddingPoints: true,
  isLooped: false,
  hasChainLift: true,
  showWoodSupports: false,
  isNightMode: false,
  cameraTarget: null,
  
  setMode: (mode) => set({ mode }),
  
  setCameraTarget: (target) => set({ cameraTarget: target }),
  
  setIsDraggingPoint: (dragging) => set({ isDraggingPoint: dragging }),
  
  setIsAddingPoints: (adding) => set({ isAddingPoints: adding }),
  
  setIsLooped: (looped) => set({ isLooped: looped }),
  
  setHasChainLift: (hasChain) => set({ hasChainLift: hasChain }),
  
  setShowWoodSupports: (show) => set({ showWoodSupports: show }),
  
  setIsNightMode: (night) => set({ isNightMode: night }),
  
  addTrackPoint: (position) => {
    const id = `point-${++pointCounter}`;
    set((state) => ({
      trackPoints: [...state.trackPoints, { id, position: position.clone(), tilt: 0 }],
    }));
  },
  
  updateTrackPoint: (id, position) => {
    set((state) => ({
      trackPoints: state.trackPoints.map((point) =>
        point.id === id ? { ...point, position: position.clone() } : point
      ),
    }));
  },
  
  updateTrackPointTilt: (id, tilt) => {
    set((state) => ({
      trackPoints: state.trackPoints.map((point) =>
        point.id === id ? { ...point, tilt } : point
      ),
    }));
  },
  
  removeTrackPoint: (id) => {
    set((state) => ({
      trackPoints: state.trackPoints.filter((point) => point.id !== id),
      selectedPointId: state.selectedPointId === id ? null : state.selectedPointId,
    }));
  },
  
  createLoopAtPoint: (id) => {
    set((state) => {
      const pointIndex = state.trackPoints.findIndex((p) => p.id === id);
      if (pointIndex === -1) return state;
      
      const entryPoint = state.trackPoints[pointIndex];
      const entryPos = entryPoint.position.clone();
      
      // Calculate forward direction from track
      let forward = new THREE.Vector3(1, 0, 0);
      if (pointIndex > 0) {
        const prevPoint = state.trackPoints[pointIndex - 1];
        forward = entryPos.clone().sub(prevPoint.position);
        forward.y = 0;
        if (forward.length() < 0.1) {
          forward = new THREE.Vector3(1, 0, 0);
        }
        forward.normalize();
      }
      
      const loopRadius = 8;
      const numPoints = 24;
      const lateralShift = loopRadius * 2 + 4; // Lateral shift to prevent self-intersection
      const loopPoints: TrackPoint[] = [];
      
      // Compute right vector (perpendicular to forward in horizontal plane)
      const up = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(forward, up).normalize();
      
      // Loop center is one radius ahead of entry, one radius up
      // Train goes on INSIDE of loop: up the far side, over top, down near side
      // θ starts at -π/2 (bottom-back), goes to 3π/2 (bottom-front)
      // forward = R·cos(θ): starts at 0, goes to +R (far), back to 0 (top), to -R (near), to 0
      // vertical = R·(sin(θ)+1): starts at 0, goes to R, to 2R (top), to R, to 0
      
      for (let i = 1; i <= numPoints; i++) {
        const t = i / numPoints;
        const theta = -Math.PI / 2 + t * Math.PI * 2;
        
        // Smoothstep for lateral shift distribution
        const smoothT = t * t * (3 - 2 * t);
        
        // cos(θ) from θ=-π/2: 0 → 1 → 0 → -1 → 0 (forward to far side, back to near)
        const forwardOffset = Math.cos(theta) * loopRadius;
        // sin(θ)+1 from θ=-π/2: 0 → 1 → 2 → 1 → 0 (up and over)
        const verticalOffset = (Math.sin(theta) + 1) * loopRadius;
        
        // Progressive lateral shift to separate ascending/descending
        const progressiveLateral = smoothT * lateralShift;
        
        const x = entryPos.x + forward.x * forwardOffset + right.x * progressiveLateral;
        const y = entryPos.y + verticalOffset;
        const z = entryPos.z + forward.z * forwardOffset + right.z * progressiveLateral;
        
        loopPoints.push({
          id: `point-${++pointCounter}`,
          position: new THREE.Vector3(x, y, z),
          tilt: 0
        });
      }
      
      // Shift all downstream points laterally to match loop exit
      const shiftedDownstreamPoints = state.trackPoints.slice(pointIndex + 1).map(p => ({
        ...p,
        position: new THREE.Vector3(
          p.position.x + right.x * lateralShift,
          p.position.y,
          p.position.z + right.z * lateralShift
        )
      }));
      
      // Combine: original up to entry + loop + shifted remainder
      const newTrackPoints = [
        ...state.trackPoints.slice(0, pointIndex + 1),
        ...loopPoints,
        ...shiftedDownstreamPoints
      ];
      
      return { trackPoints: newTrackPoints };
    });
  },
  
  selectPoint: (id) => set({ selectedPointId: id }),
  
  clearTrack: () => {
    set({ trackPoints: [], selectedPointId: null, rideProgress: 0, isRiding: false });
  },
  
  setRideProgress: (progress) => set({ rideProgress: progress }),
  
  setIsRiding: (riding) => set({ isRiding: riding }),
  
  setRideSpeed: (speed) => set({ rideSpeed: speed }),
  
  startRide: () => {
    const { trackPoints } = get();
    if (trackPoints.length >= 2) {
      set({ mode: "ride", isRiding: true, rideProgress: 0 });
    }
  },
  
  stopRide: () => {
    set({ mode: "build", isRiding: false, rideProgress: 0 });
  },
}));
