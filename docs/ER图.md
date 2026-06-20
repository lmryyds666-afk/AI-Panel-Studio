```mermaid
 erDiagram
      Discussion ||--o{ Guest : "拥有"
      Discussion ||--o{ Speech : "包含"
      Discussion ||--o{ ConsensusRecord : "产生"
      Guest ||--o{ Speech : "发表"

      Discussion {
          string   id              PK  "UUID 主键"
          string   topic           "讨论话题"
          string   status          "SETUP | IN_PROGRESS | COMPLETED"
          int      expert_count    "用户指定的专家人数"
          string   summary         "主持人总结（讨论结束后填充）"
          datetime created_at      "创建时间"
          datetime updated_at      "更新时间"
      }

      Guest {
          string   id              PK  "UUID 主键"
          string   discussion_id   FK  "所属讨论"
          string   name            "姓名"
          string   role            "HOST | EXPERT"
          string   occupation      "职业"
          string   title           "头衔 / Title"
          string   stance          "立场描述"
          string   color           "专属颜色（HEX 色值）"
          string   run_status      "IDLE | PREPARING | SPEAKING"
          int      sort_order      "展示排序"
          datetime created_at      "创建时间"
          datetime updated_at      "更新时间"
      }

      Speech {
          string   id              PK  "UUID 主键"
          string   discussion_id   FK  "所属讨论"
          string   guest_id        FK  "发言人"
          string   content         "发言内容"
          string   speech_type     "OPENING | FOLLOW_UP | BRIDGING | ANSWER |
  SUPPLEMENT | COUNTER | SUMMARY"
          int      sequence        "发言序号（全局递增）"
          boolean  is_visible      "是否在 Transcript 中展示"
          datetime created_at      "发言时间"
      }

      ConsensusRecord {
          string   id                PK  "UUID 主键"
          string   discussion_id     FK  "所属讨论"
          string   record_type       "CONSENSUS | DIVERGENCE"
          string   content           "共识或分歧内容描述"
          string   related_speech_ids   "关联发言 ID 列表（JSON 数组字符串）"
          datetime created_at        "创建时间"
          datetime updated_at        "更新时间"
      }

  关系说明

  ┌──────────────────────┬──────┬──────────────────────────────────────────────┐
  │         关系         │ 基数 │                     说明                     │
  ├──────────────────────┼──────┼──────────────────────────────────────────────┤
  │ Discussion → Guest   │ 1 :  │ 一场讨论包含 1 位主持人 + N 位专家           │
  │                      │ N    │                                              │
  ├──────────────────────┼──────┼──────────────────────────────────────────────┤
  │ Discussion → Speech  │ 1 :  │ 一场讨论产生多条发言记录                     │
  │                      │ N    │                                              │
  ├──────────────────────┼──────┼──────────────────────────────────────────────┤
  │ Discussion →         │ 1 :  │ 一场讨论持续提炼多条共识 / 分歧              │
  │ ConsensusRecord      │ N    │                                              │
  ├──────────────────────┼──────┼──────────────────────────────────────────────┤
  │ Guest → Speech       │ 1 :  │ 每位嘉宾可发表多条发言                       │
  │                      │ N    │                                              │
  ├──────────────────────┼──────┼──────────────────────────────────────────────┤
  │ ConsensusRecord →    │ N :  │ 一条共识 / 分歧可关联多条发言（通过          │
  │ Speech               │ M    │ related_speech_ids JSON 字段间接关联）       │
  └──────────────────────┴──────┴──────────────────────────────────────────────┘

```

