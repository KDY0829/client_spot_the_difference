// src/lib/levels.js
// Source: "Globe and high court (Spot the difference).jpg"
// File page: https://commons.wikimedia.org/wiki/File:Globe_and_high_court_(Spot_the_difference).jpg
// License: CC BY-SA 3.0 / GFDL (see file page)
// PNG/JPEG sprite (2-up: left/right in one sheet)
// We use the 1280×480 thumbnail URL below to keep it light.

export const LEVELS = [
  {
    id: "globe-highcourt",
    title: "Globe & High Court — find the differences",
    sheetType: "sprite-2up",
    sheetURL:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Globe_and_high_court_%28Spot_the_difference%29.jpg/1280px-Globe_and_high_court_%28Spot_the_difference%29.jpg",
    // Whole sheet size (both images side-by-side)
    naturalWidth: 1280,
    naturalHeight: 480,
    // Spots are normalized to the LEFT half only (width 640 x height 480).
    // x,y,r ∈ [0,1] relative to the left half.
    // 필요하면 값 미세조정해도 됨.
    spots: [
      // 1) 좌상단 나뭇가지/하늘 영역
      { side: "left", x: 0.12, y: 0.12, r: 0.08, label: "Top branch/sky" },
      // 2) 구(지구) 내부 격자/대륙 모양부
      { side: "left", x: 0.39, y: 0.47, r: 0.08, label: "Globe pattern" },
      // 3) 난간 윗판(블랙 링) 좌중단 영역
      {
        side: "left",
        x: 0.28,
        y: 0.63,
        r: 0.06,
        label: "Rail ring (left-mid)",
      },
      // 4) 난간 윗판 우중단/박스 근처
      {
        side: "left",
        x: 0.58,
        y: 0.7,
        r: 0.06,
        label: "Rail ring (right-mid)",
      },
      // 5) 배경 건물(High Court) 쪽
      { side: "left", x: 0.77, y: 0.22, r: 0.06, label: "Distant building" },
      // 6) 바닥(콘크리트/포장 경계) 좌하단
      { side: "left", x: 0.1, y: 0.86, r: 0.06, label: "Pavement corner" },
      // 7) 수면/하늘 반사 영역 좌상중
      { side: "left", x: 0.55, y: 0.18, r: 0.07, label: "Cloud/water area" },
    ],
  },
];
