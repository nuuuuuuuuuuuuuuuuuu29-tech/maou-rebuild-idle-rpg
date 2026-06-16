import { DUNGEONS } from "./dungeons";
import type { DungeonEnemy, EnemyCharacterDefinition } from "../types/game";

interface EnemyMeta {
  kind: string;
  flavor: string;
  weight?: number;
}

const ENEMY_META: Record<string, EnemyMeta> = {
  "tax-armor": {
    kind: "残響鎧",
    flavor: "徴税隊の怨念だけが残った空鎧。古い命令に従い、門を守り続ける。",
    weight: 4,
  },
  "bell-wisp": {
    kind: "鐘霊",
    flavor: "壊れた鐘楼に宿った薄い影。警鐘の音で隊列を乱す。",
    weight: 3,
  },
  "village-warden": {
    kind: "境界守",
    flavor: "煤けた村を占拠する番人。錆びた鐘を鳴らし、残党を呼び寄せる。",
    weight: 1,
  },
  "glass-crawler": {
    kind: "硝子蟲",
    flavor: "黒い硝子片を背にまとった這い寄る魔蟲。足音より早く刃が届く。",
    weight: 4,
  },
  "moss-sentinel": {
    kind: "苔人形",
    flavor: "古い守衛像に湿った苔が絡みついたもの。重い腕で進路を塞ぐ。",
    weight: 3,
  },
  "mirror-stag": {
    kind: "鏡獣",
    flavor: "月光を角にため込む森の守り手。弱った者の姿を映して惑わせる。",
    weight: 1,
  },
  "chain-halberd": {
    kind: "鉄鎖兵",
    flavor: "鎖を巻いた長柄兵。間合いの外から足を絡め、隊列を引き裂く。",
    weight: 4,
  },
  "rust-cannon": {
    kind: "砲台殻",
    flavor: "錆びた砲身に魔力が残った自走砲台。遅いが一撃が重い。",
    weight: 3,
  },
  "gate-captain": {
    kind: "砦将",
    flavor: "鉄鎖の砦を守る門将。壊れた軍規を今も振りかざす。",
    weight: 1,
  },
  "ore-eater": {
    kind: "鉱喰い",
    flavor: "灰色鉱山に巣食う硬い獣。鉱石を噛み砕く顎で装甲を割る。",
    weight: 4,
  },
  "lamp-phantom": {
    kind: "坑道霊",
    flavor: "古い坑道灯に残った亡霊。揺れる灯で距離感を奪う。",
    weight: 3,
  },
  "ash-titan": {
    kind: "灰巨人",
    flavor: "鉱山の最深部で炉心を抱えた巨体。足音だけで天井を震わせる。",
    weight: 1,
  },
  "banner-breaker": {
    kind: "破旗兵",
    flavor: "旧魔王軍の旗を踏みにじった外郭兵。士気を折ることに長ける。",
    weight: 4,
  },
  "moat-witchflame": {
    kind: "堀火",
    flavor: "外堀の黒水から立つ鬼火。近づく者の熱を奪って燃える。",
    weight: 3,
  },
  "outer-lord": {
    kind: "外郭領主",
    flavor: "旧城外郭を奪った小領主。玉座への道を自分のものと勘違いしている。",
    weight: 1,
  },
  "red-acolyte": {
    kind: "赤月信徒",
    flavor: "赤い月に祈る狂信者。血灯の明かりで仲間を呼ぶ。",
    weight: 4,
  },
  "pew-crawler": {
    kind: "礼拝蟲",
    flavor: "礼拝席の下を這う多脚の影。祈りの声に紛れて噛みつく。",
    weight: 3,
  },
  "choir-wraith": {
    kind: "聖歌亡霊",
    flavor: "途切れた聖歌だけを繰り返す霊。声が届くほど刃が鈍る。",
    weight: 2,
  },
  "scarlet-bishop": {
    kind: "緋司祭",
    flavor: "血月礼拝堂を束ねる司祭。祈りではなく呪いを説く。",
    weight: 1,
  },
  "lava-bone-brute": {
    kind: "溶骨鬼",
    flavor: "溶岩で固まった骨をまとう怪力の鬼。鈍重だが受け止めにくい。",
    weight: 4,
  },
  "cinder-salamander": {
    kind: "火蜥蜴",
    flavor: "灰の隙間を泳ぐ火蜥蜴。尻尾の火花で陣形を散らす。",
    weight: 3,
  },
  "forge-impaler": {
    kind: "鍛炉槍兵",
    flavor: "炉の熱で赤く焼けた槍を掲げる番兵。突撃の初速が速い。",
    weight: 2,
  },
  "crater-giant": {
    kind: "火口巨人",
    flavor: "骨と溶岩でできた巨人。火口そのものを盾として背負う。",
    weight: 1,
  },
  "silk-stalker": {
    kind: "影糸狩り",
    flavor: "黒い糸を張り巡らせる狩人。足を止めた相手を逃がさない。",
    weight: 4,
  },
  "blind-oracle": {
    kind: "盲目予言者",
    flavor: "目を閉じたまま未来の痛みを告げる魔女。告げた傷は現実になる。",
    weight: 3,
  },
  "cocoon-knight": {
    kind: "繭騎士",
    flavor: "白い繭鎧に包まれた騎士。剣よりも沈黙で部隊を圧する。",
    weight: 2,
  },
  "spider-duchess": {
    kind: "蜘蛛公女",
    flavor: "尖塔を支配する蜘蛛の貴婦人。糸の一本まで命令に従う。",
    weight: 1,
  },
  "rift-maw": {
    kind: "裂け口",
    flavor: "虚無の裂け目から開く牙。敵というより、地形そのものの悪意。",
    weight: 4,
  },
  "hollow-rider": {
    kind: "虚ろ騎手",
    flavor: "中身のない鎧に乗る騎手。馬蹄音だけが先に届く。",
    weight: 3,
  },
  "null-magus": {
    kind: "無音術師",
    flavor: "呪文の音を消して魔法を撃つ術師。避ける合図が残らない。",
    weight: 2,
  },
  "rift-sovereign": {
    kind: "裂隙王",
    flavor: "裂け目の奥で王を名乗る影。現実の継ぎ目をねじ曲げる。",
    weight: 1,
  },
  "crownless-guard": {
    kind: "無冠衛兵",
    flavor: "玉座跡に残った近衛。守るべき王を失っても剣だけは下ろさない。",
    weight: 4,
  },
  "abyssal-scribe": {
    kind: "深淵書記",
    flavor: "敗北の記録を書き足す書記。記された傷は部隊の記憶に残る。",
    weight: 3,
  },
  "eclipse-herald": {
    kind: "蝕告者",
    flavor: "終わりの合図を告げる使者。声を聞いた者の足取りは重くなる。",
    weight: 2,
  },
  "throne-echo": {
    kind: "玉座残響",
    flavor: "かつての玉座にこびりついた支配の残響。魔王の帰還を試す影。",
    weight: 1,
  },
};

const toEnemyDefinition = (
  enemy: DungeonEnemy,
  dungeonId: string,
  dungeonName: string,
  isBoss = false,
): EnemyCharacterDefinition => {
  const meta = ENEMY_META[enemy.id] ?? {
    kind: isBoss ? "首領" : "魔物",
    flavor: enemy.logLine,
    weight: isBoss ? 1 : 3,
  };

  return {
    id: enemy.id,
    name: enemy.name,
    kind: meta.kind,
    hp: enemy.hp,
    attack: enemy.atk,
    defense: enemy.def,
    speed: enemy.spd,
    flavor: meta.flavor,
    dungeonId,
    dungeonName,
    weight: meta.weight ?? (isBoss ? 1 : 3),
    isBoss,
  };
};

export const ENEMY_CATALOG: EnemyCharacterDefinition[] = DUNGEONS.flatMap((dungeon) => [
  ...dungeon.enemies.map((enemy) => toEnemyDefinition(enemy, dungeon.id, dungeon.name)),
  toEnemyDefinition(dungeon.boss, dungeon.id, dungeon.name, true),
]);

export const getEnemyCatalogForDungeon = (dungeonId: string) =>
  ENEMY_CATALOG.filter((enemy) => enemy.dungeonId === dungeonId);

export const getEnemyDefinition = (enemyId: string, dungeonId?: string) =>
  ENEMY_CATALOG.find((enemy) => enemy.id === enemyId && (!dungeonId || enemy.dungeonId === dungeonId));
