export function isCrossOriginSubframe(targetWindow: Window = window): boolean {
  try {
    if (targetWindow.top === targetWindow.self) {
      return false;
    }

    return targetWindow.top?.location.origin !== targetWindow.location.origin;
  } catch {
    return true;
  }
}

export function shouldProcessCurrentFrame(
  crossOriginIframesEnabled: boolean,
  targetWindow: Window = window
): boolean {
  return crossOriginIframesEnabled || !isCrossOriginSubframe(targetWindow);
}
