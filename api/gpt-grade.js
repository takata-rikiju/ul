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
    throw new Error(`OpenAI API error: ${JSON.stringify(data)}`);
  }

  // Responses API: output_text が便利（無い場合は data.output から拾う実装にする）
  const outText = data.output_text || "";
  if (!outText) {
    throw new Error("Empty output_text from OpenAI");
  }

  return JSON.parse(outText);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    // ★ここが変更点：text/instruction ではなく構造化入力
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
      "No activity counter.",
      "Return ONLY valid JSON that matches the provided JSON schema.",
      "If you add an example not stated, wrap it as _**inferred text**_.",
      "comment must be ONE concise Japanese string suitable for writing into a spreadsheet cell."
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
