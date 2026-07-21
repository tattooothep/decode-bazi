import { normalizeDeg } from "./mountains";

export const CIRCULAR_HEXAGRAMS_64 = [
  "復","頤","屯","益","震","噬嗑","隨","无妄","明夷","賁","既濟","家人","豐","離","革","同人",
  "臨","損","節","中孚","歸妹","睽","兌","履","泰","大畜","需","小畜","大壯","大有","夬","乾",
  "姤","大過","鼎","恆","巽","井","蠱","升","訟","困","未濟","解","渙","坎","蒙","師",
  "遯","咸","旅","小過","漸","蹇","艮","謙","否","萃","晉","豫","觀","比","剝","坤",
] as const;

export const KING_WEN_NUMBER: Record<string,number> = {
  乾:1,坤:2,屯:3,蒙:4,需:5,訟:6,師:7,比:8,小畜:9,履:10,泰:11,否:12,同人:13,大有:14,謙:15,豫:16,
  隨:17,蠱:18,臨:19,觀:20,噬嗑:21,賁:22,剝:23,復:24,无妄:25,大畜:26,頤:27,大過:28,坎:29,離:30,
  咸:31,恆:32,遯:33,大壯:34,晉:35,明夷:36,家人:37,睽:38,蹇:39,解:40,損:41,益:42,夬:43,姤:44,
  萃:45,升:46,困:47,井:48,革:49,鼎:50,震:51,艮:52,漸:53,歸妹:54,豐:55,旅:56,巽:57,兌:58,
  渙:59,節:60,中孚:61,小過:62,既濟:63,未濟:64,
};

export function focusedRingIndexes(degree:number) {
  const deg=normalizeDeg(degree);
  const hexIndex=Math.floor(normalizeDeg(deg+2.8125)/5.625)%64;
  const yaoIndex=Math.floor(normalizeDeg(deg+(360/384)/2)/(360/384))%384;
  const fenjinIndex=Math.floor(normalizeDeg(deg+22.5)/3)%120;
  return {degree:deg,hexIndex,hexName:CIRCULAR_HEXAGRAMS_64[hexIndex],hexNumber:KING_WEN_NUMBER[CIRCULAR_HEXAGRAMS_64[hexIndex]],yaoIndex,yaoPosition:yaoIndex%6,fenjinIndex};
}

export function yaoLinePosition(value:unknown):number {
  const text=String(value||"");
  if (text.startsWith("初")) return 0;
  if (text.endsWith("二")) return 1;
  if (text.endsWith("三")) return 2;
  if (text.endsWith("四")) return 3;
  if (text.endsWith("五")) return 4;
  if (text.startsWith("上")) return 5;
  return -1;
}
