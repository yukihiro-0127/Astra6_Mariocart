# AEROFORGE

夕暮れの空中工業都市を走る、オリジナルの3Dホバーカートレース。コースは **Skyline Foundry Circuit**。プレイヤーと3台のCPUが3周を競います。

## 起動

```sh
npm install
npm run dev
```

ブラウザで http://127.0.0.1:5173 を開き、**START RACING** または Enter。デスクトップの WebGL 2 対応ブラウザ向け。開発サーバーは自分のPCだけからアクセスできる設定です。

```sh
npm run build       # dist/ に静的配布用ファイルを生成
npm run preview     # ビルド結果をローカル確認
npm test            # 物理・順位・アイテム等の回帰テスト
npm run test:browser # 起動済み dev server を Chromium で検証
node tests/playthrough.mjs # 実時間のキーボード操作による3周検証
```

Playwright のブラウザがない場合は `npx playwright install chromium`。初回の npm インストール以降、ゲームは有料API・外部画像・外部フォント・ネット接続を必要としません。

## 操作

| キー | 操作 |
|---|---|
| W / ↑ | アクセル |
| S / ↓ | ブレーキ、押し続けるとバック |
| A・D / ←・→ | ステアリング |
| Space | 曲がりながらドリフト。0.85秒以上チャージして離すと加速 |
| Shift | 所持アイテムを使用 |
| R | 最後に検証済みの安全な地点へ復帰 |
| Esc | ポーズ / 再開 |
| H / ? ボタン | 操作説明 |
| F3 | デバッグ情報 |

光る **Energy Gate** を通ると1個だけアイテムを持てます。Pulse Boost は加速、Gravity Snare は後方に減速フィールド、Arc Shield は一定時間内の妨害を1回防御、Vector Swap は安全な前方の路面へ短距離転移。下位では加速・転移の確率が少し高くなります。

細いライム色の分岐はショートカット。ガードレールのない高架では落下に注意。落下時は自動で復帰し、Rでも戻れます。コース外は減速し、壁接触は速度を落として滑ります。逆走とチェックポイント飛ばしではゴールできません。

CPU: **VALE**（安定型）、**CINDER**（攻撃型）、**VEX**（高速型）。追い越し・減速フィールド回避・分岐選択・アイテム使用を判断し、緩やかな速度補正で競争を維持します。

## 構成と拡張

`src/config.js` に主要な走行・ドリフト・アイテム・周回設定と車両定義。`track.js` がコース形状と判定、`physics.js` が走行、`ai.js` がCPU、`items.js` が効果、`game.js` が状態と周回、`renderer.js` が3D、`ui.js` が画面、`audio.js` が合成音、`main.js` が入力とループです。

`/prototype.html` に初期2台・1周の検証用試作を保持しています。`?test=1` の変更可能な検証フックは開発環境だけで有効。通常は `window.aeroforge.snapshot()` で状態を読み出せます。

設計: [docs/DESIGN.md](docs/DESIGN.md) / 不具合と検証記録: [docs/TESTING.md](docs/TESTING.md)。描画は負荷に応じて内部解像度を調整します。ソフトウェア描画ではGPU環境と速度が異なります。

すべてのコース・車両・パイロット・背景・UI図形はコードで制作。音は Web Audio の合成で、既存ゲームの素材や音楽は使用していません。ライブラリは Three.js、Vite、Playwright（MIT / MIT / Apache-2.0）。詳細は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
