import { isCrossOriginSubframe, shouldProcessCurrentFrame } from "../../extension/src/content/frameScope";

function createWindowLike({
  sameAsTop = false,
  topOrigin = "https://top.example.com",
  locationOrigin = "https://frame.example.com",
  topThrows = false
}: {
  sameAsTop?: boolean;
  topOrigin?: string;
  locationOrigin?: string;
  topThrows?: boolean;
}): Window {
  const target: {
    self?: unknown;
    top?: unknown;
    location?: { origin: string };
  } = {
    location: { origin: locationOrigin }
  };

  target.self = target;

  if (sameAsTop) {
    target.top = target;
  } else if (topThrows) {
    Object.defineProperty(target, "top", {
      get() {
        throw new DOMException("Blocked a frame with origin", "SecurityError");
      }
    });
  } else {
    target.top = {
      location: { origin: topOrigin }
    };
  }

  return target as Window;
}

describe("frame scope helpers", () => {
  it("treats top-level and same-origin subframes as non-cross-origin", () => {
    expect(isCrossOriginSubframe(createWindowLike({ sameAsTop: true }))).toBe(false);
    expect(
      isCrossOriginSubframe(
        createWindowLike({
          topOrigin: "https://app.example.com",
          locationOrigin: "https://app.example.com"
        })
      )
    ).toBe(false);
  });

  it("detects cross-origin subframes and honors the toggle", () => {
    const frameWindow = createWindowLike({
      topOrigin: "https://parent.example.com",
      locationOrigin: "https://child.example.com"
    });

    expect(isCrossOriginSubframe(frameWindow)).toBe(true);
    expect(shouldProcessCurrentFrame(true, frameWindow)).toBe(true);
    expect(shouldProcessCurrentFrame(false, frameWindow)).toBe(false);
  });

  it("falls back to cross-origin when top window access is blocked", () => {
    const frameWindow = createWindowLike({ topThrows: true });

    expect(isCrossOriginSubframe(frameWindow)).toBe(true);
    expect(shouldProcessCurrentFrame(false, frameWindow)).toBe(false);
  });
});
