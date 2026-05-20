import { getDungeon } from "../data/dungeons";
import { getItemDefinition } from "../data/items";
import { getStrategy } from "../data/strategies";
import { getUnitTemplate } from "../data/units";
import type {
  DungeonEnemy,
  DungeonRewardItem,
  ExpeditionMvp,
  ExpeditionRecord,
  ExpeditionRewards,
  ExpeditionState,
  GameState,
  GameUnit,
  LogEntry,
  RewardItemStack,
} from "../types/game";
import { createUnit, makeId } from "./progression";

interface BattleSimulationResult {
  record: ExpeditionRecord;
  partyUpdates: GameUnit[];
  rescuedUnits: GameUnit[];
  rewards: ExpeditionRewards;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const randomRange = (min: number, max: number) => min + Math.random() * (max - min);

const randomInt = (min: number, max: number) => Math.floor(randomRange(min, max + 1));

const pick = <T,>(items: T[]) => items[randomInt(0, items.length - 1)];

const unitPower = (unit: GameUnit) =>
  unit.currentHp * 0.26 + unit.atk * 1.7 + unit.def * 1.25 + unit.spd * 1.08 + unit.level * 5;

const enemyPower = (enemy: DungeonEnemy, difficulty: number) =>
  enemy.hp * 0.33 + enemy.atk * 1.75 + enemy.def * 1.2 + enemy.spd + difficulty * 15;

const makeLog = (active: ExpeditionState, index: number, type: LogEntry["type"], message: string) => {
  const step = active.durationSeconds * 1000 * (index / 12);
  return {
    id: makeId("log"),
    at: active.startedAt + Math.floor(step),
    type,
    message,
  };
};

const dungeonFlavor: Record<
  string,
  {
    intro: string[];
    route: string[];
    traps: string[];
    treasure: string[];
    boss: string[];
    victory: string[];
    failure: string[];
    retreat: string[];
  }
> = {
  "ash-border-village": {
    intro: [
      "煤の雨が屋根を叩く。村の門札には、まだ人間軍の徴税印が焼き付いている。",
      "崩れた井戸から冷たい息が上がる。ここを取り戻せば、魔王軍は再び道を持つ。",
      "灰色の畑に黒旗が立つ。小さな村だが、敗北後の一歩には十分な戦場だ。",
    ],
    route: [
      "軒先の影が揺れ、古い警鐘が誰もいない空へ一度だけ鳴った。",
      "焼けた納屋の奥で、徴税隊が残した木箱がきしむ。",
      "石畳に残る足跡は新しい。誰かが魔王軍の帰還を嫌っている。",
    ],
    traps: [
      "徴税隊の置き土産、針金の鳴子が跳ねた。部隊は低く伏せてやり過ごす。",
      "崩れた床下から錆びた杭が突き出す。傷は浅いが、村はまだ牙を隠している。",
      "壊れた鐘が落ち、灰が舞った。黒旗は汚れたが折れていない。",
    ],
    treasure: [
      "納屋の床板を剥がすと、隠し袋が月錆びの匂いを吐いた。",
      "徴税箱の二重底から、再建に使える物資が転がり出る。",
      "井戸端の石の下で、小さな戦利品が静かに待っていた。",
    ],
    boss: [
      "村の広場に近づくほど、錆びた鐘の音が心臓と同じ速さで鳴る。",
      "最後の門の向こうで、番人の影が鐘楼より長く伸びた。",
    ],
    victory: [
      "黒旗が村の煙突に結ばれる。灰の匂いの中に、かすかな帰還の匂いが混じった。",
      "村鐘は沈黙した。代わりに、魔王軍の足音が境界を取り戻したと告げる。",
    ],
    failure: [
      "村は小さい。だが敗北の傷はまだ深い。次は旗を守るだけでなく、門を奪おう。",
      "灰の中に撤退路を刻む。悔しさは残ったが、敵の配置はもう読めている。",
    ],
    retreat: [
      "鐘の音が大きくなりすぎた。部隊は灰に身を隠し、次の夜へ牙を研ぐ。",
      "無理に押せば黒旗まで失う。隊長は唇を噛み、村の地図だけを持ち帰った。",
    ],
  },
  "black-glass-woods": {
    intro: [
      "黒玻璃の枝が月を細かく割る。森は美しく、そして明らかに敵意を持っていた。",
      "足元で硝子の葉が鳴る。隠密には向かないが、魔王軍の威圧にはよく響く。",
      "焼け残りの森へ踏み込む。枝先に映る部隊の影が、一つ多い。",
    ],
    route: [
      "硝子の小道は分岐し続ける。正しい道だけが、靴裏を切らない。",
      "黒い樹皮の内側から、見知らぬ視線がこちらを数えている。",
      "森の奥で白い獣骨が吊られていた。警告か、招待かはまだ分からない。",
    ],
    traps: [
      "踏み抜いた硝子根が鋭く跳ねる。速度を落とさなければ血の道標になる。",
      "枝が弓のようにしなり、黒い破片を吐いた。盾がなければ危なかった。",
      "鏡面の沼が足を吸う。部隊は互いの名を呼び、幻の道を断ち切った。",
    ],
    treasure: [
      "倒木のうろに、誰かが隠した護符が眠っていた。",
      "硝子の葉を払うと、古い地図片が月明かりを返した。",
      "苔むした石櫃が開き、森の湿った匂いと戦利品がこぼれた。",
    ],
    boss: [
      "森の中心で風が止まる。鏡角が月を受け、部隊の弱さだけを映した。",
      "黒玻璃の枝が円形に倒れ、決闘場のような空地が現れる。",
    ],
    victory: [
      "鏡角は砕け、森の道が一つ魔王軍へ膝を折った。",
      "硝子の葉が静かに降る。森はまだ暗いが、もう完全な敵ではない。",
    ],
    failure: [
      "森は勝者の足音だけを覚える。次は道具と人数を整え、闇の枝を折ろう。",
      "鏡に映った敗北を忘れるな。映像は消えるが、弱点は残る。",
    ],
    retreat: [
      "枝が退路を塞ぐ前に撤退する。森は笑ったが、地形は盗み見た。",
      "幻に追われながら後退。誰も置き去りにしなかったことだけが、今夜の戦果だ。",
    ],
  },
  "rust-chain-fort": {
    intro: [
      "錆鎖の関所に黒旗が近づく。鎖門はまだ、魔王軍を通す気がない。",
      "風に揺れる鎖が、処刑台の鐘のように鳴った。ここから先は補給線の奪い合いだ。",
      "砦の壁は低いが、火薬と悪意で厚く見える。",
    ],
    route: [
      "門番の詰所から、踏み荒らされた軍靴の跡が続いている。",
      "鎖の巻き上げ機が軋む。これを奪えば、街道は再び開く。",
      "砦の中庭には古い魔王軍旗が踏みつけられていた。",
    ],
    traps: [
      "足元の鎖が跳ね、足首を刈り取ろうとした。部隊は刃で鎖を断つ。",
      "砲眼から火花。警戒していなければ、ここで隊列が焼けていた。",
      "鉄扉が背後で落ちる。退路を奪うつもりなら、門ごと壊すまでだ。",
    ],
    treasure: [
      "武器庫の鍵束を奪い、黒火薬の小瓶を見つけた。",
      "鎖門の詰所に残された補給袋を押収する。",
      "古い作戦机の引き出しから、星欠けの地図が見つかった。",
    ],
    boss: [
      "鎖門の上で隊長が剣を抜く。門は開かない。ならば、倒して開ける。",
      "砦の鐘が鳴り、すべての鎖が一斉に震えた。",
    ],
    victory: [
      "鎖門が落ちる。街道は再び、魔王軍の荷車と野心を通す。",
      "砦の旗竿に黒旗が上がる。錆の匂いが、勝利の匂いに変わった。",
    ],
    failure: [
      "鎖門はまだ閉じたまま。だが鍵穴の形は覚えた。次は必ずこじ開ける。",
      "砲煙の向こうで敵が笑う。笑わせておけ、火薬の位置はもう分かった。",
    ],
    retreat: [
      "砲台が起ききる前に撤退。部隊は煙の下を這い、鎖の配置を記憶した。",
      "門は破れなかったが、次の突破口は見えた。傷を塞ぎ、また来る。",
    ],
  },
  "gray-vein-mine": {
    intro: [
      "灰脈鉱坑の口は、巨大な獣の喉のように開いている。",
      "坑道の奥で鎚音が響く。誰も掘っていないはずなのに。",
      "灰鉄の匂いが濃い。ここを取れば、再建の骨組みが手に入る。",
    ],
    route: [
      "坑灯が一つ、こちらの呼吸に合わせて明滅した。",
      "壁面の鉱脈が赤く脈打つ。まるで地下そのものが眠りから覚めるようだ。",
      "古い台車が勝手に転がり、深層への道を指した。",
    ],
    traps: [
      "天井が鳴る。落石を避けた瞬間、背後の道が灰に埋まった。",
      "足元のレールが火花を散らし、呪われた台車が突っ込んでくる。",
      "毒灰の袋が破れた。布で口を覆い、短く息を合わせる。",
    ],
    treasure: [
      "鉱夫の隠し棚から、黒火薬と月錆びの欠片が見つかる。",
      "崩れた支柱の裏に、落王の印片がひっそりと挟まっていた。",
      "灰鉄の箱をこじ開ける。中身は重く、帰り道の希望も重い。",
    ],
    boss: [
      "深層で巨人の炉心が赤く灯る。坑道全体が一歩後ずさった。",
      "採掘巨人が鎚を持ち上げる。天井の影まで武器にするつもりだ。",
    ],
    victory: [
      "巨人の炉心が消え、坑道に静寂が戻る。灰鉄は魔王軍のものだ。",
      "採掘音が止む。次に響くのは、再建の槌音だ。",
    ],
    failure: [
      "地下は逃げ場が少ない。負けた理由も、次の勝ち筋も、壁に刻まれている。",
      "坑道の闇に押し返された。だが鉱脈は逃げない。次は支度を変えて掘り抜く。",
    ],
    retreat: [
      "落石が退路を細くする。欲張れば全員が灰になる。撤退は賢い呪い避けだ。",
      "巨人の足音が近い。部隊は火薬を抱え、闇の口から転がり出た。",
    ],
  },
  "old-castle-moat": {
    intro: [
      "旧王城の外濠に立つ。ここは敗北の日、王冠が泥に沈んだ場所だ。",
      "城壁の影が長い。だが今日の黒旗は、影に呑まれるためではなく帰るために来た。",
      "外濠の水は黒い。覗き込むと、かつての魔王軍の顔がこちらを見返す。",
    ],
    route: [
      "水面に青黒い火が走る。城はまだ、帰還を歓迎していない。",
      "割れた石橋に、古い配下たちの爪痕が残っている。",
      "城門から風が吹く。そこには玉座の埃と敵の嘲りが混じっていた。",
    ],
    traps: [
      "濠の水が刃となって跳ねる。濡れた影が足首を掴もうとする。",
      "城壁の狭間から呪火が降る。盾を上げる音が夜を裂いた。",
      "橋石が沈み、黒い水が口を開ける。誰かの手が仲間を引き戻した。",
    ],
    treasure: [
      "崩れた礼拝堂で、落王の印片が赤く光った。",
      "見張り台の床下から、簒奪者が隠した補給品を奪う。",
      "外濠の鎖を巻き上げると、古い宝箱が水底から顔を出した。",
    ],
    boss: [
      "城門前に簒奪者の将が立つ。王の帰還を笑う口を、今から閉じさせる。",
      "外濠の風が止まる。玉座へ続く道を賭けた一戦が始まる。",
    ],
    victory: [
      "外濠に黒旗が映る。まだ玉座は遠い。だが城は、帰還を認め始めた。",
      "簒奪者の将が退く。城門は閉じたままだが、音を立てて怯えた。",
    ],
    failure: [
      "城は簡単には返らない。だからこそ奪い返す価値がある。傷を数え、誇りも数えろ。",
      "外濠の水が敗北を映す。次はその水面を、勝利の黒旗で塗りつぶす。",
    ],
    retreat: [
      "城壁が迫る。部隊は外濠から身を引いたが、帰還の道を忘れはしない。",
      "玉座は遠い。だが遠いだけだ。撤退の足音は、次の進軍の前奏になる。",
    ],
  },
  "blood-moon-chapel": {
    intro: ["赤い月が割れた聖窓に張り付いている。礼拝堂は祈りではなく呪いで満ちていた。"],
    route: ["長椅子の間を進むたび、誰かの懺悔が足元で砕ける。", "祭壇の奥から、血灯の明かりが瞬いた。"],
    traps: ["床の聖印が反転し、赤い針のような呪いが足元から伸びる。", "鐘楼の紐が勝手に揺れ、頭上から砕けた鐘片が降った。"],
    treasure: ["告解室の隠し棚から、血の匂いを帯びた物資が見つかる。", "祭壇下の石棺が開き、古い印章が月光を拒んだ。"],
    boss: ["緋色の祭壇が鳴る。祈りを捨てた司教が、断罪の杖を掲げた。"],
    victory: ["赤い月光が弱まり、礼拝堂は黒旗の影を受け入れた。"],
    failure: ["呪いは深く、祈りは腐っている。次は灯りと盾を増やして戻ろう。"],
    retreat: ["鐘の音が血のように濃くなった。部隊は扉を蹴破り、夜へ逃げる。"],
  },
  "molten-bone-crater": {
    intro: ["熔岩が骨の隙間を流れる。火口そのものが巨大な炉のように唸っていた。"],
    route: ["赤熱した骨橋を渡る。足を止めれば靴底から魂まで焦げる。", "火口の底で、巨人の肋骨が鐘のように鳴った。"],
    traps: ["地面が割れ、熔岩の舌が部隊の影を舐める。", "骨柱が倒れ、火花をまき散らして退路を塞いだ。"],
    treasure: ["冷えた熔岩の割れ目から、熱を失わない核石を掘り出す。", "炉跡の灰を払うと、黒火薬がまだ生きていた。"],
    boss: ["火口の中心が持ち上がる。巨人の胸で熔核が太陽のように脈打つ。"],
    victory: ["火口の唸りが静まる。魔王軍は炎の骨を再建資材として奪った。"],
    failure: ["熱に押し返された。だが火口の呼吸は読めた。次は焼かれる前に叩き割る。"],
    retreat: ["熔岩が道を呑む。無理に進めば勝利ではなく灰になる。"],
  },
  "shadow-cocoon-spire": {
    intro: ["尖塔は影の繭に包まれ、空へ伸びる黒い針のように立っている。"],
    route: ["階段は音を吸い、仲間の呼吸だけが頼りになる。", "壁の繭がわずかに震え、中の何かがこちらを数えた。"],
    traps: ["影糸が足首に巻き付き、部隊を天井へ吊ろうとする。", "鏡のない廊下で、影だけが逆方向へ歩き出した。"],
    treasure: ["繭を裂くと、光を吸う糸束がこぼれ落ちた。", "塔占師の机から、虚晶石が冷たい音を立てて転がる。"],
    boss: ["最上階の巣で、公妃が微笑む。黒旗すら糸で飾るつもりらしい。"],
    victory: ["尖塔の繭が裂け、夜風が初めて中へ入った。"],
    failure: ["影に絡め取られた敗北だ。次は速さと火力で糸を断ち切ろう。"],
    retreat: ["糸が閉じる前に塔を降りる。背後で公妃の笑いだけが残った。"],
  },
  "void-rift-wastes": {
    intro: ["荒野の裂け目から、空の裏側が覗いている。歩くほど世界の縫い目が軋む。"],
    route: ["地平線が一瞬だけ折れ曲がり、進むべき道を隠した。", "風は吹かない。代わりに、何もない場所がこちらの名を呼ぶ。"],
    traps: ["足元の影が裂け、部隊を別の場所へ落とそうとする。", "音が消え、合図が届かない。全員が視線だけで隊列を保つ。"],
    treasure: ["空間の傷口から、虚晶石が血のように滲み出る。", "裂け目の縁に、蝕翼の羽根が黒い光を残していた。"],
    boss: ["裂け目の主が半身を現す。こちらの勝利だけが、まだ存在していない未来らしい。"],
    victory: ["荒野の裂け目が一つ縫い合わされる。黒旗は世界の外側にも届いた。"],
    failure: ["虚無は強い。だが何もないなら、こちらの勝ち筋を書き込む余白もある。"],
    retreat: ["裂け目が広がる。部隊は存在を失う前に、名前を呼び合って撤退した。"],
  },
  "abyssal-throne-ruins": {
    intro: ["深淵玉座跡に踏み込む。ここでは沈黙さえ、王に跪いている。"],
    route: ["砕けた玉座の階段に、過去の魔王軍の足音が重なる。", "壁に刻まれた名が一つずつ消え、現在の黒旗だけが残る。"],
    traps: ["玉座の影が伸び、隊列の中心を奪おうとする。", "深淵の書架が開き、敗北の記録を刃に変えた。"],
    treasure: ["王座下の空洞から、心臓のように脈打つ核が見つかる。", "古い王冠の台座に、魔冠の破片がまだ熱を残していた。"],
    boss: ["空の玉座が震える。かつての王の反響が、今の魔王を試すために立ち上がった。"],
    victory: ["玉座跡に黒旗が立つ。まだ王冠は戻らない。だが影は、主を思い出した。"],
    failure: ["玉座は重い。背負うにはまだ力がいる。だが挑んだ者だけが、いつか座れる。"],
    retreat: ["深淵が名を呑む前に退く。部隊は互いの名を叫び、現世へ戻った。"],
  },
};

const strategyLogs = {
  balanced: [
    "作戦方針はバランス重視。刃を急がせず、盾を眠らせない。",
    "隊列は標準陣形。前進と警戒を同じ歩幅で進める。",
  ],
  safe: [
    "作戦方針は安全重視。勝利より先に、全員で帰る道を確保する。",
    "慎重な進軍を選ぶ。罠の影を踏む前に、影そのものを疑う。",
  ],
  rush: [
    "作戦方針は強行突破。黒旗は風より速く、敵の準備より早く進む。",
    "部隊は足を止めない。多少の傷は、勝利の後で数えればいい。",
  ],
  loot: [
    "作戦方針は戦利品重視。勝つだけでなく、敵の倉まで空にするつもりだ。",
    "部隊は横道にも目を光らせる。宝の匂いも、危険の匂いも濃くなる。",
  ],
};

const mvpTitles = {
  balanced: ["黒旗の支柱", "戦列の要", "静かな殊勲者"],
  safe: ["帰還路の守り手", "慎重なる盾", "夜道の案内役"],
  rush: ["先陣の牙", "突破の火種", "疾風の荒武者"],
  loot: ["宝嗅ぎの才", "隠し蔵破り", "戦利品の導き手"],
};

const mvpNotes = [
  "{name}は危うい場面で一歩前へ出た。その一歩が、部隊全体の歩幅を変えた。",
  "{name}の判断が遅れていれば、黒旗は泥に落ちていた。",
  "{name}は傷を受けても隊列を崩さず、帰還後もまだ戦場を見ていた。",
  "{name}が拾った勝機は小さかった。だが小さな勝機ほど、魔王軍にはよく燃える。",
];

const rareRewardLines = [
  "戦利品の中に、月明かりを拒むような輝きが混じっている。これはただの拾得物ではない。",
  "宝箱の底で、古い魔力が爪を立てた。希少な品が黒旗の下へ渡る。",
  "封蝋が砕けた瞬間、空気が一段冷えた。価値あるものは、いつも少し呪われている。",
];

const itemNames = (items: RewardItemStack[]) =>
  items
    .map((item) => {
      const definition = getItemDefinition(item.itemId);
      return `${definition.name}x${item.quantity}`;
    })
    .join("、");

const hasRareReward = (items: RewardItemStack[], rescuedUnits: GameUnit[]) =>
  items.some((item) => {
    const rarity = getItemDefinition(item.itemId).rarity;
    return rarity === "rare" || rarity === "epic" || rarity === "legendary";
  }) || rescuedUnits.some((unit) => unit.rarity === "rare" || unit.rarity === "epic" || unit.rarity === "legendary");

const chooseMvp = (party: GameUnit[], strategyId: ExpeditionState["strategy"]): ExpeditionMvp | undefined => {
  if (party.length === 0) {
    return undefined;
  }

  const alive = party.filter((unit) => unit.currentHp > 0);
  const candidates = alive.length > 0 ? alive : party;
  const sorted = [...candidates].sort((a, b) => unitPower(b) - unitPower(a));
  const unit = Math.random() < 0.72 ? sorted[0] : pick(sorted);
  const title = pick(mvpTitles[strategyId]);
  const note = pick(mvpNotes).replace(/\{name\}/g, unit.name);

  return {
    unitId: unit.id,
    name: unit.name,
    title,
    note,
  };
};


const applyDamage = (party: GameUnit[], amount: number) => {
  let remaining = Math.max(1, Math.round(amount));
  const next = party.map((unit) => ({ ...unit }));

  while (remaining > 0 && next.some((unit) => unit.currentHp > 0)) {
    const alive = next.filter((unit) => unit.currentHp > 0);
    const target = alive[randomInt(0, alive.length - 1)];
    const packet = Math.min(remaining, Math.max(1, Math.round(randomRange(4, 13))));
    target.currentHp = Math.max(0, target.currentHp - packet);
    remaining -= packet;
  }

  return next;
};

const collectRewardItems = (
  rewards: DungeonRewardItem[],
  rewardMultiplier: number,
  lootBonus: number,
) => {
  const found: RewardItemStack[] = [];
  rewards.forEach((reward) => {
    const chance = clamp(reward.chance + lootBonus, 0.05, 0.92);
    if (Math.random() <= chance) {
      const baseQuantity = randomInt(reward.min, reward.max);
      const quantity = Math.max(1, Math.round(baseQuantity * rewardMultiplier));
      found.push({ itemId: reward.itemId, quantity });
    }
  });
  return found;
};

export const simulateExpedition = (
  state: GameState,
  active: ExpeditionState,
): BattleSimulationResult => {
  const dungeon = getDungeon(active.dungeonId);
  const flavor = dungeonFlavor[dungeon.id] ?? dungeonFlavor["ash-border-village"];
  const strategy = getStrategy(active.strategy);
  const item = active.itemId ? getItemDefinition(active.itemId) : undefined;
  const itemEffect = item?.effect;
  const party: GameUnit[] = active.unitIds
    .map((id) => state.units.find((unit) => unit.id === id))
    .filter((unit): unit is GameUnit => Boolean(unit))
    .map((unit) => ({ ...unit, status: "idle" as const }));

  const logs: LogEntry[] = [
    makeLog(active, 0, "info", `${dungeon.name}へ遠征部隊が出発。${pick(flavor.intro)}`),
    makeLog(active, 1, "info", pick(strategyLogs[active.strategy])),
  ];

  if (party.length === 0) {
    const record: ExpeditionRecord = {
      id: active.id,
      dungeonId: dungeon.id,
      dungeonName: dungeon.name,
      unitNames: [],
      strategy: active.strategy,
      startedAt: active.startedAt,
      endedAt: active.endsAt,
      status: "retreat",
      logs: [
        ...logs,
        makeLog(active, 2, "retreat", "出撃名簿が空白だった。遠征は門前で取りやめになった。"),
      ],
    };
    return {
      record,
      partyUpdates: [],
      rescuedUnits: [],
      rewards: { gold: 0, demonExp: 0, unitExp: 0, territory: 0, items: [], rescuedUnits: [] },
    };
  }

  let workingParty: GameUnit[] = party;
  let status: ExpeditionRecord["status"] = "success";
  let logIndex = 2;
  const successBonus =
    strategy.successBonus + (itemEffect?.successBonus ?? 0) + (dungeon.id === "ash-border-village" ? 0.28 : 0);
  const damageMultiplier = strategy.damageMultiplier * (itemEffect?.damageMultiplier ?? 1);
  const rewardMultiplier = strategy.rewardMultiplier * (itemEffect?.rewardMultiplier ?? 1);
  const lootBonus = strategy.lootBonus + (itemEffect?.lootBonus ?? 0);

  for (let floor = 1; floor <= dungeon.floors; floor += 1) {
    const enemy = dungeon.enemies[(floor - 1) % dungeon.enemies.length];
    const trapChance =
      active.strategy === "safe" ? 0.12 : active.strategy === "rush" ? 0.34 : active.strategy === "loot" ? 0.28 : 0.2;
    if (Math.random() < trapChance && workingParty.some((unit) => unit.currentHp > 0)) {
      const trapDamage = Math.max(1, (dungeon.difficulty * randomRange(2.2, 5.5) + floor) * damageMultiplier);
      workingParty = applyDamage(workingParty, trapDamage);
      logs.push(makeLog(active, logIndex, "info", `${floor}階: ${pick(flavor.traps)}`));
      logIndex += 1;
    } else if (Math.random() < 0.38) {
      logs.push(makeLog(active, logIndex, "info", `${floor}階: ${pick(flavor.route)}`));
      logIndex += 1;
    }

    const alivePower = workingParty.filter((unit) => unit.currentHp > 0).reduce((sum, unit) => sum + unitPower(unit), 0);
    const enemyScore = enemyPower(enemy, dungeon.difficulty);
    const levelGap = state.demonLordLevel - dungeon.recommendedLevel;
    const chance = clamp(0.58 + (alivePower - enemyScore) / (enemyScore * 2.6) + levelGap * 0.04 + successBonus, 0.12, 0.96);
    const roll = Math.random();

    logs.push(makeLog(active, logIndex, "battle", `${floor}階: ${enemy.logLine} ${pick(flavor.route)}`));
    logIndex += 1;

    if (roll <= chance) {
      const damage = Math.max(
        1,
        (enemy.atk * randomRange(0.55, 1.15) + dungeon.difficulty * 3 - workingParty.reduce((sum, unit) => sum + unit.def, 0) / workingParty.length * 0.22) *
          damageMultiplier,
      );
      workingParty = applyDamage(workingParty, damage);
      const aliveForDeed = workingParty.filter((unit) => unit.currentHp > 0);
      const actor = pick(aliveForDeed.length > 0 ? aliveForDeed : workingParty);
      logs.push(
        makeLog(
          active,
          logIndex,
          "battle",
          `${actor.name}が${enemy.name}の隙を裂いた。敵影はほどけ、部隊は黒旗を低く掲げて進む。`,
        ),
      );
      logIndex += 1;
    } else {
      const damage = Math.max(5, enemy.atk * randomRange(1.55, 2.25) * damageMultiplier);
      workingParty = applyDamage(workingParty, damage);
      const allDown = workingParty.every((unit) => unit.currentHp <= 0);
      status = allDown || roll > chance + 0.18 ? "failure" : "retreat";
      logs.push(
        makeLog(
          active,
          logIndex,
          status === "failure"
            ? "failure"
            : "retreat",
          status === "failure"
            ? `${enemy.name}の反撃で隊列が崩壊。${pick(flavor.failure)}`
            : `${enemy.name}の抵抗が激しい。${pick(flavor.retreat)}`,
        ),
      );
      logIndex += 1;
      break;
    }
  }

  if (status === "success") {
    const alivePower = workingParty.filter((unit) => unit.currentHp > 0).reduce((sum, unit) => sum + unitPower(unit), 0);
    const bossScore = enemyPower(dungeon.boss, dungeon.difficulty) * 1.18;
    const chance = clamp(
      0.54 + (alivePower - bossScore) / (bossScore * 2.35) + (state.demonLordLevel - dungeon.recommendedLevel) * 0.05 + successBonus,
      0.1,
      0.95,
    );
    const roll = Math.random();
    logs.push(makeLog(active, logIndex, "battle", `最深部: ${pick(flavor.boss)} ${dungeon.boss.logLine}`));
    logIndex += 1;

    if (roll <= chance) {
      const damage = Math.max(3, dungeon.boss.atk * randomRange(0.9, 1.45) * damageMultiplier);
      workingParty = applyDamage(workingParty, damage);
      logs.push(makeLog(active, logIndex, "success", `${dungeon.boss.name}を退けた。${pick(flavor.victory)}`));
      logIndex += 1;
    } else {
      const damage = Math.max(8, dungeon.boss.atk * randomRange(1.85, 2.65) * damageMultiplier);
      workingParty = applyDamage(workingParty, damage);
      const allDown = workingParty.every((unit) => unit.currentHp <= 0);
      status = allDown || roll > chance + 0.12 ? "failure" : "retreat";
      logs.push(
        makeLog(
          active,
          logIndex,
          status === "failure"
            ? "failure"
            : "retreat",
          status === "failure"
            ? `${dungeon.boss.name}に敗北。${pick(flavor.failure)}`
            : `${dungeon.boss.name}を前に、部隊は勝機なしと判断した。${pick(flavor.retreat)}`,
        ),
      );
      logIndex += 1;
    }
  }

  const rewardScale = status === "success" ? 1 : status === "retreat" ? 0.45 : 0.3;
  const gold = Math.round(randomRange(dungeon.goldMin, dungeon.goldMax) * rewardMultiplier * rewardScale);
  const demonExp = Math.round(dungeon.demonExp * (status === "success" ? 1 : status === "retreat" ? 0.45 : 0.3));
  const unitExp = Math.round(dungeon.unitExp * strategy.unitExpMultiplier * (status === "success" ? 1 : status === "retreat" ? 0.55 : 0.4));
  const territory = status === "success" ? dungeon.territoryReward : 0;
  const items =
    status === "success"
      ? collectRewardItems(dungeon.rewards, rewardMultiplier, lootBonus)
      : collectRewardItems(dungeon.rewards, 0.5, lootBonus - 0.2).slice(0, 1);

  if (items.length > 0) {
    logs.push(makeLog(active, logIndex, "loot", `${pick(flavor.treasure)} 獲得: ${itemNames(items)}。`));
    logIndex += 1;
  }

  const rescuedUnits: GameUnit[] = [];
  if (status === "success") {
    const rescueChance = clamp(
      0.42 + lootBonus + (active.strategy === "safe" ? 0.05 : 0) + (dungeon.id === "ash-border-village" ? 0.12 : 0),
      0.18,
      0.78,
    );
    const hasRoom = state.units.length < state.unitCapacity;
    if (hasRoom && Math.random() <= rescueChance) {
      const templateId = dungeon.rescuePool[randomInt(0, dungeon.rescuePool.length - 1)];
      const template = getUnitTemplate(templateId);
      const rescued = createUnit(templateId, {
        level: Math.max(1, dungeon.recommendedLevel - 1),
      });
      rescuedUnits.push(rescued);
      logs.push(
        makeLog(
          active,
          logIndex,
          "rescue",
          `牢の奥で鎖が鳴る。${template.species}を救出すると、新しい配下は黒旗へ静かに膝をついた。`,
        ),
      );
      logIndex += 1;
    } else if (!hasRoom) {
      logs.push(makeLog(active, logIndex, "rescue", "牢の鍵は見つかったが、配下枠に余裕がなく救出部隊を残せなかった。"));
      logIndex += 1;
    }
  }

  const recoveryBase = active.endsAt;
  const partyUpdates = workingParty.map((unit) => {
    if (unit.currentHp <= 0) {
      const template = getUnitTemplate(unit.templateId);
      return {
        ...unit,
        currentHp: 0,
        status: "downed" as const,
        recoveryUntil: recoveryBase + template.recoverySeconds * 1000,
      };
    }

    return {
      ...unit,
      status: "idle" as const,
      recoveryUntil: undefined,
    };
  });

  const mvp = chooseMvp(partyUpdates, active.strategy);
  if (mvp) {
    logs.push(makeLog(active, logIndex, status === "success" ? "success" : "info", `MVP: ${mvp.name}「${mvp.title}」。${mvp.note}`));
    logIndex += 1;
  }

  if (hasRareReward(items, rescuedUnits)) {
    logs.push(makeLog(active, logIndex, "loot", pick(rareRewardLines)));
    logIndex += 1;
  }

  const rewards: ExpeditionRewards = {
    gold,
    demonExp,
    unitExp,
    territory,
    items,
    mvp,
    rescuedUnits: rescuedUnits.map((unit) => ({
      unitId: unit.id,
      name: unit.name,
      species: unit.species,
      rarity: unit.rarity,
    })),
  };

  const record: ExpeditionRecord = {
    id: active.id,
    dungeonId: dungeon.id,
    dungeonName: dungeon.name,
    unitNames: party.map((unit) => unit.name),
    strategy: active.strategy,
    startedAt: active.startedAt,
    endedAt: active.endsAt,
    status,
    logs,
    rewards,
  };

  return { record, partyUpdates, rescuedUnits, rewards };
};
