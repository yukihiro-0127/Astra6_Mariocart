// Full Chromium uses the system GPU; headless-shell otherwise defaults to SwiftShader.
export const browserOptions={headless:true,channel:'chromium',args:process.platform==='darwin'?['--use-angle=metal']:[]};
