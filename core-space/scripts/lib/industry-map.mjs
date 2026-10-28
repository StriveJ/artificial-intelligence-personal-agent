// industry map
// Read-only normalization preserves matching for older native-language profile values.
const LEGACY_INDUSTRIES = new Map([
 ['\u786c\u4ef6/\u5d4c\u5165\u5f0f','hardware/embedded'], ['\u4e92\u8054\u7f51/\u8f6f\u4ef6','internet/software'], ['\u4eba\u5de5\u667a\u80fd','artificial-intelligence'], ['\u4f20\u7edfIT','enterprise-IT'],
 ['\u5d4c\u5165\u5f0f\u5f00\u53d1','embedded development'], ['\u5355\u7247\u673a\u5f00\u53d1','microcontroller development'], ['FPGA\u5f00\u53d1','FPGA development'], ['\u786c\u4ef6\u8bbe\u8ba1','hardware design'], ['\u534a\u5bfc\u4f53','semiconductors'], ['\u82af\u7247\u8bbe\u8ba1','chip design'],
 ['\u524d\u7aef\u5f00\u53d1','frontend development'], ['\u540e\u7aef\u5f00\u53d1','backend development'], ['\u5168\u6808\u5f00\u53d1','full-stack development'], ['\u79fb\u52a8\u5f00\u53d1','mobile development'],
 ['\u673a\u5668\u5b66\u4e60','machine learning'], ['\u6df1\u5ea6\u5b66\u4e60','deep learning'], ['\u8ba1\u7b97\u673a\u89c6\u89c9','computer vision'], ['\u81ea\u7136\u8bed\u8a00\u5904\u7406','natural language processing'], ['\u6570\u636e\u79d1\u5b66','data science'],
 ['\u4f01\u4e1a\u8f6f\u4ef6','enterprise software'], ['\u7cfb\u7edf\u96c6\u6210','systems integration'], ['IT\u8fd0\u7ef4','IT operations'], ['\u6570\u636e\u5e93\u7ba1\u7406','database administration'],
]);
export const canonicalIndustry = value => (LEGACY_INDUSTRIES.get(String(value)) || String(value)).toLowerCase();

export function parseIndustryMap(text) {
  const map = Object.create(null);
  let started = false, category = '';
  for (const [i, raw] of String(text).split(/\r?\n/).entries()) {
    const line = raw.replace(/[ \t]+#.*$/, '');
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (line === 'industries:' && !started) { started = true; continue; }
    const group = line.match(/^  ([^:\r\n]+):[ \t]*$/);
    if (started && group) {
      category = group[1].trim();
      if (Object.hasOwn(map, category)) throw new Error("Duplicate industry category: " + category);
      map[category] = []; continue;
    }
    const item = line.match(/^    -[ \t]+([^\r\n]+)$/);
    if (started && category && item) { map[category].push(item[1].trim()); continue; }
    throw new Error("industry-map.yaml line " + (i + 1) + " does not match the industries/category/list structure");
  }
  if (!started || !Object.keys(map).length || Object.values(map).some(items => !items.length)) throw new Error("industry-map.yaml lacks valid categories");
  return map;
}
