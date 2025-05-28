Account creation

1. sudo -u postgres psql
2. CREATE ROLE "MIRAI" WITH LOGIN PASSWORD 'hogehogePassword';

Database creation

1. CREATE DATABASE "MIRAI" WITH OWNER "MIRAI" ENCODING 'UTF8';
2. \c "MIRAI"

Table creation

1. users

   ```sql
    CREATE TABLE users (
        -- 非認証情報
        user_id      TEXT PRIMARY KEY,
        username        TEXT NOT NULL,
        global_name     TEXT,
        avatar          TEXT,
        -- OAuth2認証情報
        email           TEXT,
        verified        BOOLEAN,
        -- DiscordAPI認証情報
        refresh_token   TEXT,
        discord_token_expires_at TIMESTAMP,
        -- MIRAI認証情報
        lang            TEXT,
        birthday        DATE,
        country         TEXT,
        auth_date       TIMESTAMP,
        vpn             BOOLEAN,
        robot           BOOLEAN,
        -- TFA認証情報
        tfa_enabled     BOOLEAN,
        tfa_method      TEXT,
        tfa_app_secret TEXT,
        tfa_issued_at   TIMESTAMP
   );
   ```

2. sessions

   ```sql
    CREATE TABLE sessions (
        session_id   TEXT PRIMARY KEY,
        user_id      TEXT REFERENCES users(user_id) ON DELETE CASCADE,
        ip           INET,
        ua           TEXT,
        vpn          BOOLEAN,
        first_date   TIMESTAMP,
        last_date    TIMESTAMP,
        expires_at TIMESTAMP,
        enabled      BOOLEAN
   );
   ```

3. linked_accounts

    ```sql
    CREATE TABLE linked_accounts (
        base_user_id    TEXT REFERENCES users(user_id) ON DELETE CASCADE,
        linked_user_id  TEXT REFERENCES users(user_id) ON DELETE CASCADE,
        PRIMARY KEY (base_user_id, linked_user_id)
    );
    ```

4. guilds

    ```sql
    -- guildsテーブル（サーバー設定）
    CREATE TABLE guilds (
        server_id       TEXT PRIMARY KEY,
        owner_id        TEXT REFERENCES users(user_id) ON DELETE CASCADE,
        lang            TEXT,
        country         TEXT,
        channel_id      TEXT,
        role_id         TEXT,
        tfa_required    BOOLEAN,
        vpn_check       BOOLEAN,
        robot_check     BOOLEAN,
        spam_protection_level INTEGER, -- 0:無効 1:低 2:中 3:高 4:ProtocolZ(最終手段)

        -- ✅ 柔軟な認証免除設定（user_idごとの詳細な情報を記録可能）
        auth_exempt_settings JSONB DEFAULT '{}'::JSONB,

        notice_enabled  BOOLEAN, -- true: DM, false: channel
        created_at      TIMESTAMP DEFAULT now(),
        updated_at      TIMESTAMP DEFAULT now(),
    );
    ```

    example of auth_exempt_settings

    ```json
    {
        "user_id_1": {
            "reason": "trusted",
            "added_at": "2023-01-01T00:00:00Z",
            "expires_at": "2023-12-31T23:59:59Z"
        },
        "user_id_2": {
            "reason": "trusted",
            "added_at": "2023-01-01T00:00:00Z",
            "expires_at": null
        }
    }
    ```

5. spam_analysis_users

    ```sql
    -- スパム分析ユーザー
    CREATE TABLE spam_analysis_user (
        user_id             TEXT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
        -- 危険度スコア（0.0〜1.0推奨、1.0に近いほど危険）
        risk_score          REAL CHECK (risk_score >= 0.0 AND risk_score <= 1.0),
        -- 行動パターンに基づく属性スコア群（0〜100など自由に設計可）
        -- 属性スコア群（0〜100の範囲で設計）
        -- メッセージ関連スコア
        message_frequency_score     INTEGER CHECK (message_frequency_score >= 0 AND message_frequency_score <= 100), -- メッセージの頻度
        message_length_score        INTEGER CHECK (message_length_score >= 0 AND message_length_score <= 100),      -- メッセージの長さ
        emoji_usage_score           INTEGER CHECK (emoji_usage_score >= 0 AND emoji_usage_score <= 100),            -- 使用される絵文字の種類
        message_timing_score        INTEGER CHECK (message_timing_score >= 0 AND message_timing_score <= 100),      -- メッセージの時間帯
        reply_speed_score           INTEGER CHECK (reply_speed_score >= 0 AND reply_speed_score <= 100),            -- 返信の速さ
        -- コンテンツ関連スコア
        topic_mention_score         INTEGER CHECK (topic_mention_score >= 0 AND topic_mention_score <= 100),        -- 特定のトピックに関する言及
        mention_usage_score         INTEGER CHECK (mention_usage_score >= 0 AND mention_usage_score <= 100),        -- メンションの使用頻度
        media_usage_score           INTEGER CHECK (media_usage_score >= 0 AND media_usage_score <= 100),            -- スタンプやGIFの使用
        message_tone_score          INTEGER CHECK (message_tone_score >= 0 AND message_tone_score <= 100),          -- メッセージのトーン（ポジティブ/ネガティブ）
        question_frequency_score    INTEGER CHECK (question_frequency_score >= 0 AND question_frequency_score <= 100), -- 質問の頻度
        -- アクティビティ関連スコア
        reaction_count_score        INTEGER CHECK (reaction_count_score >= 0 AND reaction_count_score <= 100),      -- リアクションの数
        channel_activity_score      INTEGER CHECK (channel_activity_score >= 0 AND channel_activity_score <= 100),  -- チャンネルごとの活動量
        interaction_depth_score     INTEGER CHECK (interaction_depth_score >= 0 AND interaction_depth_score <= 100), -- ユーザー間の対話の深さ
        keyword_usage_score         INTEGER CHECK (keyword_usage_score >= 0 AND keyword_usage_score <= 100),        -- 特定のキーワードの使用
        message_type_score          INTEGER CHECK (message_type_score >= 0 AND message_type_score <= 100),          -- メッセージのタイプ（テキスト、音声、ビデオ）
        -- スパム関連スコア
        spam_message_ratio_score    INTEGER CHECK (spam_message_ratio_score >= 0 AND spam_message_ratio_score <= 100), -- スパムメッセージの割合
        user_participation_score    INTEGER CHECK (user_participation_score >= 0 AND user_participation_score <= 100), -- ユーザーの参加率
        content_diversity_score     INTEGER CHECK (content_diversity_score >= 0 AND content_diversity_score <= 100),  -- メッセージの内容の多様性
        feedback_frequency_score    INTEGER CHECK (feedback_frequency_score >= 0 AND feedback_frequency_score <= 100), -- フィードバックの頻度
        -- その他のスコア
        server_participation_score  INTEGER CHECK (server_participation_score >= 0 AND server_participation_score <= 100), -- 参加しているサーバーの数
        collaboration_frequency_score INTEGER CHECK (collaboration_frequency_score >= 0 AND collaboration_frequency_score <= 100), -- 他のユーザーとのコラボレーションの頻度
        message_edit_score          INTEGER CHECK (message_edit_score >= 0 AND message_edit_score <= 100),          -- メッセージの編集回数
        message_deletion_score      INTEGER CHECK (message_deletion_score >= 0 AND message_deletion_score <= 100),  -- メッセージの削除率
        activity_time_score         INTEGER CHECK (activity_time_score >= 0 AND activity_time_score <= 100),        -- 特定の時間帯におけるアクティビティ
        -- ユーザー属性関連スコア
        user_role_score             INTEGER CHECK (user_role_score >= 0 AND user_role_score <= 100),                -- ユーザーの役職（管理者、一般など）
        message_language_score      INTEGER CHECK (message_language_score >= 0 AND message_language_score <= 100),  -- メッセージの言語
        event_participation_score   INTEGER CHECK (event_participation_score >= 0 AND event_participation_score <= 100), -- 参加イベントの数
        follower_count_score        INTEGER CHECK (follower_count_score >= 0 AND follower_count_score <= 100),      -- ユーザーのフォロワー数
        message_theme_score         INTEGER CHECK (message_theme_score >= 0 AND message_theme_score <= 100)         -- メッセージのテーマ（ゲーム、趣味、仕事など）
        -- AIによる総合的な安全度判定（1.0に近いほど安全）
        user_safety_score   REAL CHECK (user_safety_score >= 0.0 AND user_safety_score <= 1.0),
        -- 評価モデルに関する情報
        evaluated_at        TIMESTAMP DEFAULT now(), -- 最終評価日時
        evaluated_by_model  TEXT                   -- 使用モデル名（例: "spam-v1.2"）
    );
    ```

6. spam_analysis_channels

    ```sql
    CREATE TABLE spam_analysis_channels (
        channel_id              TEXT PRIMARY KEY,
        server_id               TEXT REFERENCES guilds(server_id) ON DELETE CASCADE,

        -- 会話の内容傾向（数値化されたカテゴリごとの出現率など）
        link_ratio              REAL,   -- リンクを含むメッセージの割合（0.0〜1.0）
        emoji_density           REAL,   -- メッセージあたりの絵文字使用率
        repetition_rate         REAL,   -- 類似メッセージの頻度（繰り返し投稿）
        offensive_score_avg     REAL,   -- 有害表現の平均スコア（単語ベース）

        -- スパム基準と比べたズレ（＋なら許容すべき傾向）
        spam_deviation_score    REAL,   -- グローバルモデルとの差分（-1.0〜1.0）

        -- AIによる総合的な安全度判定（1.0に近いほど安全）
        channel_safety_score    REAL CHECK (channel_safety_score >= 0.0 AND channel_safety_score <= 1.0),

        evaluated_at            TIMESTAMP DEFAULT now(),
        evaluated_by_model      TEXT
    );
    ```

7. credit_wallets

    ```sql
    CREATE TABLE credit_wallets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id TEXT NOT NULL,  -- Discord ID or service identifier
        is_service BOOLEAN NOT NULL DEFAULT FALSE,
        public_key TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    ```

8. access_logs

    ```sql
    -- httpアクセスログ
    CREATE TABLE access_logs (
        ip_address   INET NOT NULL,
        user_agent   TEXT,
        request_path  TEXT,
        request_method TEXT,
        response_code INTEGER,
        body         TEXT,
        timestamp   TIMESTAMP DEFAULT now()
    );
    ```

9. tfa_temp

    ```sql
    -- TFA一時テーブル
    CREATE TABLE tfa_temp (
        session_id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(user_id) ON DELETE CASCADE,
        issued_at TIMESTAMP DEFAULT now(),
        expires_at TIMESTAMP
    );
    ```

10. ip_addresses

    ```sql
    -- IPアドレステーブル
    CREATE TABLE ip_addresses (
        ip_address INET PRIMARY KEY,
        verified BOOLEAN DEFAULT FALSE,
        country TEXT,
        country_code TEXT,
        region_name TEXT,
        city TEXT,
        vpn BOOLEAN DEFAULT FALSE,
        updated_at TIMESTAMP DEFAULT now()
    );
    ```

11. restricted_logs

    ```sql
    -- アカウント制限ログ
    CREATE TABLE restricted_logs (
        log_id SERIAL PRIMARY KEY,
        user_id TEXT REFERENCES users(user_id) ON DELETE CASCADE,
        username VARCHAR(50) NOT NULL,
        reason TEXT,
        restriction_type VARCHAR(100),
        action_time TIMESTAMP,
        restricted_at TIMESTAMP DEFAULT now(),
        lifted_at TIMESTAMP,
        handler VARCHAR(50),
        notes TEXT
    );
    ```
