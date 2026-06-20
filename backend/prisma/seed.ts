/**
 * AI Panel Studio — 数据库种子脚本
 *
 * 5 组高质量预设讨论，覆盖三种生命周期状态（SETUP / IN_PROGRESS / COMPLETED）。
 * 每组包含：独立话题、1 位主持人 + N 位专家嘉宾、颜色区分、示例发言与共识/分歧。
 *
 * 执行方式：
 *   cd backend
 *   npx prisma db seed
 *
 * 或手动：
 *   npx ts-node prisma/seed.ts
 *
 * 前置条件：
 *   1. DATABASE_URL 已在 .env 中配置（默认 file:./dev.db）
 *   2. prisma generate 已执行
 *   3. prisma db push 或 prisma migrate dev 已完成
 */

import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

// ════════════════════════════════════════════════════════
// 颜色分配（10 种高区分度 HEX，与前端 COLOR_POOL 一致）
// ════════════════════════════════════════════════════════

const C = {
  RED: '#FF6B6B',
  BLUE: '#45B7D1',
  GOLD: '#F7DC6F',
  PURPLE: '#BB8FCE',
  TEAL: '#4ECDC4',
  ORANGE: '#FF8C42',
  GREEN: '#2ECC71',
  CRIMSON: '#E74C3C',
  SKY: '#3498DB',
  AMBER: '#F39C12',
} as const;

// ════════════════════════════════════════════════════════
// 预设数据定义
// ════════════════════════════════════════════════════════

interface SeedGuest {
  name: string;
  role: 'HOST' | 'EXPERT';
  occupation: string;
  title: string;
  stance: string;
  color: string;
  sortOrder: number;
}

interface SeedSpeech {
  guestIndex: number; // guests 数组下标
  content: string;
  speechType: string;
  sequence: number;
}

interface SeedConsensus {
  recordType: 'CONSENSUS' | 'DIVERGENCE';
  content: string;
  relatedSpeechIndices: number[]; // speeches 数组下标
}

interface SeedDiscussion {
  topic: string;
  status: string;
  expertCount: number;
  summary: string | null;
  guests: SeedGuest[];
  speeches: SeedSpeech[];
  consensusRecords: SeedConsensus[];
}

// ════════════════════════════════════════════════════════
// 5 组预设讨论
// ════════════════════════════════════════════════════════

const seedData: SeedDiscussion[] = [
  // ─── 讨论 1：SETUP 状态（刚创建，仅嘉宾阵容）─────────
  {
    topic: 'AI 是否会在 2030 年前取代 50% 的白领岗位？',
    status: 'SETUP',
    expertCount: 4,
    summary: null,
    guests: [
      {
        name: '张维远',
        role: 'HOST',
        occupation: '资深科技媒体人',
        title: '《前沿对话》栏目主持人',
        stance: '中立引导者，擅长在分歧中找到共同点并推进讨论深度',
        color: C.TEAL,
        sortOrder: 0,
      },
      {
        name: '李敏华',
        role: 'EXPERT',
        occupation: 'AI 研究员',
        title: '某头部科技公司 AI Lab 高级研究员',
        stance: '认为 AI 将在 2030 年前显著替代重复性脑力劳动，但创造性工作仍然安全',
        color: C.RED,
        sortOrder: 1,
      },
      {
        name: '王德仁',
        role: 'EXPERT',
        occupation: '劳动经济学家',
        title: '北京大学国家发展研究院教授',
        stance: '从历史技术革命规律出发，认为技术替代是渐进的，2030 年不会出现断崖式替代',
        color: C.BLUE,
        sortOrder: 2,
      },
      {
        name: '陈思语',
        role: 'EXPERT',
        occupation: '企业数字化转型顾问',
        title: '麦肯锡全球研究院前研究员',
        stance: '企业正在主动推进 AI 化，白领工作内容将在 3 年内发生质变而非量变',
        color: C.PURPLE,
        sortOrder: 3,
      },
      {
        name: '赵明远',
        role: 'EXPERT',
        occupation: '科技伦理学者',
        title: '清华大学科技与社会研究中心副主任',
        stance: '关注 AI 替代对社会结构和劳动者尊严的影响，呼吁政策引导而非放任',
        color: C.ORANGE,
        sortOrder: 4,
      },
    ],
    speeches: [],
    consensusRecords: [],
  },

  // ─── 讨论 2：IN_PROGRESS 状态（讨论进行中，有发言+共识）─
  {
    topic: '可再生能源能否在 2035 年前全面替代化石燃料？',
    status: 'IN_PROGRESS',
    expertCount: 3,
    summary: null,
    guests: [
      {
        name: '林晓峰',
        role: 'HOST',
        occupation: '科技评论家',
        title: '《科技观察》主编',
        stance: '以数据为导向，引导各方用事实和案例支撑各自观点',
        color: C.GREEN,
        sortOrder: 0,
      },
      {
        name: '周雅文',
        role: 'EXPERT',
        occupation: '能源政策研究员',
        title: '国家发改委能源研究所高级研究员',
        stance: '认为光伏和风电成本已具备竞争力，但储能的成本与规模仍是核心瓶颈',
        color: C.GOLD,
        sortOrder: 1,
      },
      {
        name: '马志强',
        role: 'EXPERT',
        occupation: '新能源企业 CEO',
        title: '蔚蓝能源科技创始人兼 CEO',
        stance: '从产业实践出发，认为技术创新速度被低估，2035 年前电力系统可脱碳 80% 以上',
        color: C.SKY,
        sortOrder: 2,
      },
      {
        name: '何丽珍',
        role: 'EXPERT',
        occupation: '环境经济学家',
        title: '伦敦政治经济学院 (LSE) 环境经济学副教授',
        stance: '关注碳定价和市场化机制，认为政策工具比技术更关键',
        color: C.AMBER,
        sortOrder: 3,
      },
    ],
    speeches: [
      {
        guestIndex: 0,
        content: '各位观众晚上好，欢迎收看《科技观察》。今天我们聚集了三位不同领域的专家，共同讨论一个关乎人类未来的核心问题——可再生能源能否在 2035 年前全面替代化石燃料？',
        speechType: 'OPENING',
        sequence: 1,
      },
      {
        guestIndex: 1,
        content: '感谢主持人。首先我想用一组数据开场：2025 年全球新增光伏装机已突破 600GW，风电突破 150GW。从装机速度来看，我们正在经历一场能源革命。但替代的关键不是发电端，而是储能的成本曲线。',
        speechType: 'OPENING',
        sequence: 2,
      },
      {
        guestIndex: 3,
        content: '我同意周老师关于储能瓶颈的判断，但想补充一个视角：碳定价。如果全球碳市场在 2030 年前实现统一碳价在 80-100 美元/吨，化石燃料的经济性将迅速崩塌，这比任何技术突破都更具决定性。',
        speechType: 'SUPPLEMENT',
        sequence: 3,
      },
      {
        guestIndex: 2,
        content: '我和各位的看法有些不同。从产业实践来看，过去 5 年锂电池成本下降了将近 70%，钠离子电池已经开始规模化量产。以这个速度，到 2030 年储能成本将不再是瓶颈。真正的问题是电网改造的速度，而不是技术。',
        speechType: 'COUNTER',
        sequence: 4,
      },
      {
        guestIndex: 0,
        content: '马总提到了一个有趣的角度——电网改造。周老师，您如何看待电网承载能力对能源转型的制约？',
        speechType: 'FOLLOW_UP',
        sequence: 5,
      },
      {
        guestIndex: 1,
        content: '这个问题很关键。我国目前特高压线路的利用率还有提升空间，但配电网的智能化改造确实滞后。如果政策推动力足够，2030 年前完成主要城市的智能电网改造是可行的。这本质上是一个投资意愿的问题，不是技术问题。',
        speechType: 'ANSWER',
        sequence: 6,
      },
      {
        guestIndex: 0,
        content: '三位从技术、产业、政策三个维度为我们勾勒了一幅相对完整的图景。接下来我想请各位进一步聚焦——在你们各自看来，2035 年最关键的一个不确定性变量是什么？',
        speechType: 'BRIDGING',
        sequence: 7,
      },
    ],
    consensusRecords: [
      {
        recordType: 'CONSENSUS',
        content: '各方认同：光伏和风电成本已具备全面竞争力；储能技术处于加速降本通道；电网智能化改造是当前最大瓶颈之一',
        relatedSpeechIndices: [1, 2, 3],
      },
      {
        recordType: 'DIVERGENCE',
        content: '争论焦点：2035 年全面替代的关键变量究竟在技术突破（马志强）还是在政策与市场机制（何丽珍）？多大程度上可以依靠技术自然演进？',
        relatedSpeechIndices: [3, 5],
      },
    ],
  },

  // ─── 讨论 3：COMPLETED 状态（已结束，有完整总结）─────
  {
    topic: '远程办公对组织文化的影响：解放还是侵蚀？',
    status: 'COMPLETED',
    expertCount: 3,
    summary:
      '本次讨论围绕远程办公对组织文化影响的二元性展开。共识在于：混合办公已成为不可逆的趋势，远程办公在提升个人灵活性的同时，对团队凝聚力和隐性知识传递确实构成挑战。分歧集中在具体执行面——周教授主张以办公室为主、远程为辅的"3+2 模型"，而张小姐则认为企业应以结果导向取代时间导向的管理范式，远程比例不应设限。主持人林晓峰总结指出，讨论揭示了一个关键盲点：我们过度聚焦于"在哪里工作"，而忽略了"如何重新设计协作流程"本身——无论物理空间如何变化，管理的本质是信任与赋能，而非监督与控制。',
    guests: [
      {
        name: '林晓峰',
        role: 'HOST',
        occupation: '组织行为学研究者',
        title: '《管理新视野》栏目主持人',
        stance: '中立观察者，关注组织行为学的实证研究，用数据和案例引导讨论',
        color: C.GREEN,
        sortOrder: 0,
      },
      {
        name: '周建国',
        role: 'EXPERT',
        occupation: '人力资源管理专家',
        title: '中国人民大学劳动人事学院教授',
        stance: '认为远程办公削弱了组织文化中的隐性知识传递，建议采用混合办公模式',
        color: C.SKY,
        sortOrder: 1,
      },
      {
        name: '张雨晴',
        role: 'EXPERT',
        occupation: '远程办公倡导者',
        title: '「未来工作」社区创始人、《分布式团队》作者',
        stance: '远程办公释放了员工的自主性与创造力，企业应重构管理范式而非回归办公室',
        color: C.PURPLE,
        sortOrder: 2,
      },
      {
        name: '陈浩然',
        role: 'EXPERT',
        occupation: '企业 CEO',
        title: '某 SaaS 独角兽公司联合创始人兼 CEO',
        stance: '作为实践者，认为远程办公提升了招聘半径和员工留存率，但需要在工具和流程上前置投入',
        color: C.RED,
        sortOrder: 3,
      },
    ],
    speeches: [
      {
        guestIndex: 0,
        content: '欢迎各位来到《管理新视野》。今天我们要讨论的是一个正在深刻改变数亿打工人生活的议题——远程办公到底是解放了生产力，还是侵蚀了组织文化？我们有来自学界、行业实践和倡导领域的三位嘉宾。',
        speechType: 'OPENING',
        sequence: 1,
      },
      {
        guestIndex: 1,
        content: '谢谢主持人。我首先要指出一个常被忽视的事实：组织文化不是靠视频会议和 Slack 消息建立的。隐性知识——那些"在走廊上偶遇时的交流"、"会议室的即兴碰撞"——在远程环境下几乎完全消失了。我的研究数据显示，完全远程团队的新员工融入周期平均比混合团队长 40%。',
        speechType: 'OPENING',
        sequence: 2,
      },
      {
        guestIndex: 2,
        content: "我不同意这个框架。'隐性知识消失'的根本原因不是远程，而是公司没有为远程重新设计过流程。传统的'走廊偶遇'本质上是一个管理补偿机制——你们在弥补正式知识传递系统的不足。远程办公恰恰倒逼我们建立更系统化的文档文化。",
        speechType: 'COUNTER',
        sequence: 3,
      },
      {
        guestIndex: 3,
        content: '我想从企业实践的角度来说几句。我们公司 2023 年全面远程化以后，有两个数据值得分享：第一，员工 NPS 提升了 18 个百分点；第二，我们的候选人池从 3 个城市扩展到了 30 个城市。当然，我们在异步协作工具上的投入确实增加了约 15%。',
        speechType: 'SUPPLEMENT',
        sequence: 4,
      },
      {
        guestIndex: 0,
        content: '陈总提出的是一个 ROI 问题——远程化的收益和成本如何衡量。周教授，您觉得有哪些维度是财务数据无法捕捉的？',
        speechType: 'FOLLOW_UP',
        sequence: 5,
      },
      {
        guestIndex: 1,
        content: '非常好的问题。创新力是一个典型的盲区。我们追踪了 50 家科技公司发现，完全远程团队的突破性创新产出在两年内下降了 23%。这不是效率问题——远程团队的效率甚至更高——但那些需要"摩擦碰撞"的创意过程被稀释了。',
        speechType: 'ANSWER',
        sequence: 6,
      },
      {
        guestIndex: 2,
        content: '我想补充一点：周教授的研究很有价值，但需要区分"过渡期"和"稳定期"。远程协作的工具和方法论还在快速进化——VR 会议室、异步视频工具、AI 辅助文档——我们现在看到的下滑可能是阵痛，不是终局。',
        speechType: 'SUPPLEMENT',
        sequence: 7,
      },
      {
        guestIndex: 0,
        content: '感谢各位的精彩发言。这场讨论让我们看到，远程办公不是简单的"好"或"坏"的二元问题，而是要求我们重新思考管理的本质——从监督到信任，从可见到可量化，从空间到文化。',
        speechType: 'BRIDGING',
        sequence: 8,
      },
      {
        guestIndex: 0,
        content: '各位嘉宾，最后请用一句话来表达你们对组织文化未来的核心观点。',
        speechType: 'FOLLOW_UP',
        sequence: 9,
      },
      {
        guestIndex: 1,
        content: '未来的组织文化将是"混合型"的：物理空间承载情感连接与创新碰撞，虚拟空间承载高效执行与广泛协作。两者缺一不可。',
        speechType: 'SUMMARY',
        sequence: 10,
      },
      {
        guestIndex: 2,
        content: '远程不是文化的敌人，过时的管理思维才是。拥抱分布式工作，就是拥抱一个更公平、更多元、更可持续发展的未来。',
        speechType: 'SUMMARY',
        sequence: 11,
      },
      {
        guestIndex: 3,
        content: '从企业实践来看，远程化的最大障碍从来不是技术或工具，而是管理者的"失控感"。克服这个心理障碍，是每个组织通往未来的第一步。',
        speechType: 'SUMMARY',
        sequence: 12,
      },
    ],
    consensusRecords: [
      {
        recordType: 'CONSENSUS',
        content: '各方认同：混合办公是不可逆趋势；远程办公显著提升了员工满意度和候选人覆盖面（招聘半径从 3 城扩展到 30 城是实证）；组织需要主动为远程重新设计协作流程，而非简单复制线下模式',
        relatedSpeechIndices: [1, 2, 3],
      },
      {
        recordType: 'CONSENSUS',
        content: '共识：管理者需要从"过程监督"转向"结果导向"的绩效评估体系；信任与赋能是远程管理的核心要素',
        relatedSpeechIndices: [3, 7, 9],
      },
      {
        recordType: 'DIVERGENCE',
        content: '核心分歧：完全远程团队是否导致突破性创新能力下降？周建国教授援引数据显示下降 23%，张雨晴认为这是方法论演进的"阵痛期"而非永久趋势',
        relatedSpeechIndices: [4, 5],
      },
      {
        recordType: 'DIVERGENCE',
        content: '争论：远程办公比例是否应设限？学界倾向 3+2 混合模式，产业界则主张由团队自主决定',
        relatedSpeechIndices: [6, 8],
      },
    ],
  },

  // ─── 讨论 4：IN_PROGRESS 状态（新话题加入，快速产出）──
  {
    topic: '基因编辑的伦理边界在哪里？',
    status: 'IN_PROGRESS',
    expertCount: 2,
    summary: null,
    guests: [
      {
        name: '沈碧华',
        role: 'HOST',
        occupation: '科学传播者',
        title: '《科学面对面》主持人',
        stance: '以公众视角切入专业话题，帮助非专业观众理解复杂的科技伦理问题',
        color: C.AMBER,
        sortOrder: 0,
      },
      {
        name: '高志毅',
        role: 'EXPERT',
        occupation: '分子生物学家',
        title: '复旦大学生命科学学院教授、CRISPR 技术研究者',
        stance: '认为基因编辑用于治疗遗传疾病受到广泛认可，但增强型编辑的边界需要严格的国际共识',
        color: C.BLUE,
        sortOrder: 1,
      },
      {
        name: '孙晓菁',
        role: 'EXPERT',
        occupation: '生命伦理学教授',
        title: '中国社会科学院伦理学研究所研究员',
        stance: '关注基因编辑可能加剧社会不平等——"基因鸿沟"成为 21 世纪最危险的社会裂缝之一',
        color: C.RED,
        sortOrder: 2,
      },
    ],
    speeches: [
      {
        guestIndex: 0,
        content: '基因编辑技术正在以超乎想象的速度进入我们的视野——从治疗镰刀型细胞贫血症到"定制婴儿"的争议。今天我们有两位嘉宾，分别从科学和伦理的角度，帮助我们厘清这条边界到底应该画在哪里。',
        speechType: 'OPENING',
        sequence: 1,
      },
      {
        guestIndex: 1,
        content: '谢谢主持人。首先需要澄清一个常见误解：CRISPR 不是一把"基因剪刀"，而更像是一个"基因导航系统"——它的核心能力是精准定位和修改特定 DNA 序列。在治疗单基因遗传病方面，我们已经看到了令人振奋的临床成果。',
        speechType: 'OPENING',
        sequence: 2,
      },
      {
        guestIndex: 2,
        content: '我同意高教授对技术本身的描述，但我想从社会后果的角度补充。2025 年初，某国已经批准了一项"基因增强"临床试验——不是为了治病，而是为了增强肌肉力量。这个案例清楚地表明，技术已经跑在了伦理规范的前面。一旦增强型编辑成为富裕阶层的特权，我们将在生物学层面创造出一种全新的不平等。',
        speechType: 'SUPPLEMENT',
        sequence: 3,
      },
      {
        guestIndex: 0,
        content: '孙教授提出了一个非常尖锐的问题——基因鸿沟。高教授，在您看来，科学界内部对于"治疗"和"增强"的边界有没有基本共识？',
        speechType: 'FOLLOW_UP',
        sequence: 4,
      },
    ],
    consensusRecords: [
      {
        recordType: 'CONSENSUS',
        content: '共识：基因编辑用于治疗遗传疾病受到广泛认可；CRISPR 的临床价值在单基因遗传病领域已得到初步验证',
        relatedSpeechIndices: [0, 1],
      },
      {
        recordType: 'DIVERGENCE',
        content: '核心分歧：增强型基因编辑（非治疗目的）是否应在任何情况下被允许？高教授认为需建立国际共识框架，孙教授主张严格的全球性禁令',
        relatedSpeechIndices: [2, 3],
      },
    ],
  },

  // ─── 讨论 5：SETUP 状态（话题前沿，阵容豪华）─────────
  {
    topic: '太空殖民是人类的未来还是昂贵的幻想？',
    status: 'SETUP',
    expertCount: 5,
    summary: null,
    guests: [
      {
        name: '苏婉清',
        role: 'HOST',
        occupation: '科学记者',
        title: '《星际观察》栏目主持人',
        stance: '兼具科学素养与传播技巧，帮助公众在宏大叙事中找到与自身相关的连接点',
        color: C.TEAL,
        sortOrder: 0,
      },
      {
        name: '冯远征',
        role: 'EXPERT',
        occupation: '航天工程师',
        title: '中国空间技术研究院研究员、深空探测项目顾问',
        stance: '从工程可实现性出发，认为月球基地在 2035 年前具有可行性，但火星殖民面临巨大的辐射和生理挑战',
        color: C.BLUE,
        sortOrder: 1,
      },
      {
        name: '唐悦然',
        role: 'EXPERT',
        occupation: '天体物理学家',
        title: '中国科学院国家天文台研究员',
        stance: '关注行星科学数据对殖民可行性的约束——火星土壤的高氯酸盐含量和缺乏磁场的现实常被商业航天公司有意淡化',
        color: C.PURPLE,
        sortOrder: 2,
      },
      {
        name: '郑凯风',
        role: 'EXPERT',
        occupation: '太空企业家',
        title: '星河动力科技 VP、前 SpaceX 高级项目经理',
        stance: '相信商业航天的成本革命将使太空殖民从政府主导转向市场驱动，Starship 级运载工具将颠覆传统成本模型',
        color: C.RED,
        sortOrder: 3,
      },
      {
        name: '吴思源',
        role: 'EXPERT',
        occupation: '哲学家、未来学研究者',
        title: '《人类的多行星命运》作者',
        stance: '从文明延续的哲学高度出发，认为太空殖民是人类规避"大过滤器"的必然选择，不应仅以经济可行性衡量',
        color: C.ORANGE,
        sortOrder: 4,
      },
      {
        name: '刘瑾瑜',
        role: 'EXPERT',
        occupation: '地球科学教授',
        title: '北京大学地球与空间科学学院教授',
        stance: '提醒不应将太空殖民视为地球生态危机的"备胎"——修复地球的成本远低于殖民火星，两者不是非此即彼',
        color: C.GOLD,
        sortOrder: 5,
      },
    ],
    speeches: [],
    consensusRecords: [],
  },
];

// ════════════════════════════════════════════════════════
// 种子执行入口
// ════════════════════════════════════════════════════════

async function main() {
  // 读取数据库 URL
  const dbUrl = process.env.DATABASE_URL ?? 'file:./dev.db';

  console.log(`🌱 正在初始化种子数据...`);
  console.log(`   数据库: ${dbUrl}`);

  // 创建 Prisma Client（使用 Prisma 7 adapter 模式）
  const adapter = new PrismaLibSql({ url: dbUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.$connect();

    // 清空已有数据（按外键依赖顺序）
    console.log('🧹 清理已有数据...');
    await prisma.consensusRecord.deleteMany();
    await prisma.speech.deleteMany();
    await prisma.guest.deleteMany();
    await prisma.discussion.deleteMany();

    // 逐条插入
    let discCount = 0;
    let guestCount = 0;
    let speechCount = 0;
    let consensusCount = 0;

    for (const disc of seedData) {
      // 创建 Discussion
      const discussion = await prisma.discussion.create({
        data: {
          topic: disc.topic,
          status: disc.status,
          expertCount: disc.expertCount,
          summary: disc.summary,
        },
      });
      discCount++;

      // 创建 Guests（同时建立 discussion 关系）
      const createdGuests: { id: string }[] = [];
      for (const guest of disc.guests) {
        const created = await prisma.guest.create({
          data: {
            discussionId: discussion.id,
            name: guest.name,
            role: guest.role,
            occupation: guest.occupation,
            title: guest.title,
            stance: guest.stance,
            color: guest.color,
            sortOrder: guest.sortOrder,
            runStatus: 'IDLE',
          },
        });
        createdGuests.push(created);
        guestCount++;
      }

      // 创建 Speeches（关联对应 guestId）
      const createdSpeeches: { id: string }[] = [];
      for (const speech of disc.speeches) {
        const guestId = createdGuests[speech.guestIndex].id;
        const created = await prisma.speech.create({
          data: {
            discussionId: discussion.id,
            guestId,
            content: speech.content,
            speechType: speech.speechType,
            sequence: speech.sequence,
            isVisible: true,
          },
        });
        createdSpeeches.push(created);
        speechCount++;
      }

      // 创建 ConsensusRecords（关联对应 speechId）
      for (const record of disc.consensusRecords) {
        const relatedIds = record.relatedSpeechIndices.map(
          (idx) => createdSpeeches[idx].id,
        );
        await prisma.consensusRecord.create({
          data: {
            discussionId: discussion.id,
            recordType: record.recordType,
            content: record.content,
            relatedSpeechIds: JSON.stringify(relatedIds),
          },
        });
        consensusCount++;
      }
    }

    console.log('');
    console.log('✅ 种子数据初始化完成！');
    console.log(`   ${discCount} 场讨论`);
    console.log(`   ${guestCount} 位嘉宾`);
    console.log(`   ${speechCount} 条发言`);
    console.log(`   ${consensusCount} 条共识/分歧`);
    console.log('');
    console.log('讨论状态分布：');
    for (let i = 0; i < seedData.length; i++) {
      const d = seedData[i];
      console.log(`   [${d.status}] ${d.topic.slice(0, 40)}... (${d.guests.length} 人)`);
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ 种子数据写入失败：', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
