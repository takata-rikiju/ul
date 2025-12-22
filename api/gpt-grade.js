// api/gpt-grade.js

function schemaForCategory(category) {
  if (category === 4) {
    return {
      type: "object",
      additionalProperties: false,
      required: ["scores", "comment"],
      properties: {
        scores: {
          type: "object",
          additionalProperties: false,
          required: ["difficulty", "recognition", "major_fit", "other"],
          properties: {
            difficulty: { type: "integer", minimum: 1, maximum: 5 },
            recognition: { type: "integer", minimum: 1, maximum: 5 },
            major_fit: { type: "integer", minimum: 1, maximum: 5 },
            other: { type: "integer", minimum: 1, maximum: 5 }
          }
        },
        comment: { type: "string" }
      }
    };
  }

  return {
    type: "object",
    additionalProperties: false,
    required: ["scores", "comment"],
    properties: {
      scores: {
        type: "object",
        additionalProperties: false,
        required: ["continuity", "humanity", "major_fit", "leadership_initiative", "other"],
        properties: {
          continuity: { type: "integer", minimum: 1, maximum: 5 },
          humanity: { type: "integer", minimum: 1, maximum: 5 },
          major_fit: { type: "integer", minimum: 1, maximum: 5 },
          leadership_initiative: { type: "integer", minimum: 1, maximum: 5 },
          other: { type: "integer", minimum: 1, maximum: 5 }
        }
      },
      comment: { type: "string" }
    }
  };
}

function extractOutputText(data) {
  // 1) SDK等で output_text がある場合
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  // 2) RESTの一般形：output[].content[].text を走査
  if (Array.isArray(data.output)) {
    const texts = [];
    for (const item of data.output) {
      if (!item || !Array.isArray(item.content)) continue;
      for (const c of item.content) {
        if (c && typeof c.text === "string") texts.push(c.text);
      }
    }
    const joined = texts.join("\n").trim();
    if (joined) return joined;
  }

  // 3) 念のためのフォールバック
  if (typeof data.text === "string" && data.text.trim()) {
    return data.text.trim();
  }

  return "";
}

async function callOpenAIResponses({ apiKey, model, developerInstructions, userInput, schema }) {
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "developer", content: developerInstructions },
        { role: "user", content: userInput }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "grading_output",
          schema,
          strict: true
        }
      }
    })
  });

  const data = await r.json();

  if (!r.ok) {
    // ここでOpenAI側のエラー内容が分かるようにそのまま返す
    throw new Error(`OpenAI API error: ${JSON.stringify(data)}`);
  }

  const outText = extractOutputText(data);
  if (!outText) {
    // デバッグしやすいように生レスポンスを含める
    throw new Error("Empty text output from OpenAI: " + JSON.stringify(data));
  }

  try {
    return JSON.parse(outText);
  } catch (e) {
    // JSON Schema strictでも、万一のときに原因を見える化
    throw new Error("Model output was not valid JSON. outText=" + outText);
  }
}


export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    const { category, major, fields } = req.body || {};

    const cat = Number(category);
    if (![1, 2, 3, 4, 5].includes(cat)) {
      return res.status(400).json({ ok: false, error: "category must be 1-5" });
    }
    if (!major || typeof major !== "string") {
      return res.status(400).json({ ok: false, error: "major is required (string)" });
    }
    if (!fields || typeof fields !== "object") {
      return res.status(400).json({ ok: false, error: "fields is required (object)" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ ok: false, error: "API key not configured" });
    }

const developerInstructions = [
  "You are an expert American University Admissions Consultant.",
  "Return the analysis in JAPANESE.",
  "Ground your analysis ONLY in the provided input fields. Do not invent facts.",
  "Return ONLY valid JSON that matches the provided JSON schema.",
  "If you add an example not stated, wrap it as _**inferred text**_.",
  "COMMENT OUTPUT RULE (MANDATORY):",
  "- The `comment` field is NOT an evaluation summary. Do NOT mention scores or why you scored it that way.",
  "- The `comment` must be a concrete revision instruction list for the student to edit the spreadsheet fields.",
  "- Write in Japanese, imperative and actionable. Assume the student will edit the exact fields in `fields`.",
  "- Format: a short checklist (3 to 6 bullets). Each bullet starts with '・'.",
  "- Each bullet must specify WHAT to change and WHERE (which field), e.g. '・【what_you_did】成果を数字で追記（例：_**XX人に週XX時間指導**_）'.",
  "- If you suggest new details that are not in the input, wrap only the example part as _**inferred text**_.",
  "- If a field is already strong, you may include at most one bullet like '・【organization_description】現状で十分具体的。' (optional). Prefer improvement bullets.",
  "REVISION PRIORITIES (apply top-down):",
  "1) Add measurable outcomes/impact (numbers, scope, frequency).",
  "2) Clarify role and ownership (I did X vs participated).",
  "3) Add leadership/initiative evidence (led, designed, implemented).",
  "4) Improve specificity (tools, audience, deliverables, process).",
  "5) Align content with intended major for major-related wording (do not change facts).",
  "6) If likely over character limits, instruct the student to shorten by removing low-value phrases and keeping numbers.",
  "SCORING CALIBRATION (FEW-SHOT EXEMPLARS):",
  "- Use the following exemplars as your primary guide for scoring calibration (1-5).",
  "- Your scores must be consistent in scale and severity with these examples.",
  "Sample 1 (Category 1: Volunteer): \"Cards of Hope\" -> Scores: 継続性:2, 人間性・社会性:4, メジャー関連:2, 自主性:4, その他(新しさ等):4",
  "Sample 2 (Category 2: Work Experience): \"XX College - Teaching Assistant\" -> Scores: 継続性:2, 人間性・社会性:4, メジャー関連:4, 自主性:4, その他(新しさ等):5",
  "Sample 3 (Category 3: Educational Program): \"Coursera - Introduction to Business\" -> Scores: 継続性:5, 人間性・社会性:3, メジャー関連:5, 自主性:3, その他(新しさ等):5",
  "Sample 4 (Category 4: Award): \"Dean's List\" -> Scores: 難易度・凄さ:4, 社会的認知度:4, メジャー関連:5, その他(新しさなど):2",
  "Sample 5 (Category 5: Extracurricular): \"The International Students' Association - President\" -> Scores: 継続性:4, 人間性・社会性:5, メジャー関連:5, リーダーシップ・自主性:4, その他:4",
  "INTENDED MAJOR USAGE (MANDATORY):",
  "- The student's intended major is provided as `major` in the input JSON.",
  "- You MUST use `major` when assigning the `major_fit` score.",
  "- Do not guess a different major; use exactly the provided `major`.",
  "MAJOR_FIT SCORING RUBRIC (1-5):",
  "5 = Direct, explicit alignment with the major’s core subject matter and skills; clear academic/professional preparation.",
  "4 = Strong alignment; builds major-relevant skills or domain knowledge with clear connection.",
  "3 = Indirect alignment; mostly transferable skills that still support the major (e.g., leadership, communication, basic research habits).",
  "2 = Weak alignment; connection is minor or speculative.",
  "1 = No meaningful alignment with the major based on the provided fields.",
].join("\n");


    const schema = schemaForCategory(cat);

    // user入力は、major/category/fields をそのまま渡す（モデル側で参照）
    const userInput = JSON.stringify({ category: cat, major, fields });

    const result = await callOpenAIResponses({
      apiKey,
      model: "gpt-5.2", // 必要に応じて変更
      developerInstructions,
      userInput,
      schema
    });

    return res.status(200).json({ ok: true, result });
  } catch (e) {
    console.error("Server error:", e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
