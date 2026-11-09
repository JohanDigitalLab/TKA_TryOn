
export async function GET() {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return Response.json(
      { success: false, message: "GROQ_API_KEY tidak ditemukan." },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-20b",
          messages: [
            {
              role: "user",
              content:
                "Jawab dalam bahasa Indonesia: Apakah koneksi AI TKA TryOn berhasil? Jelaskan secara singkat.",
            },
          ],
          reasoning_effort: "low",
          include_reasoning: false,
          max_completion_tokens: 1024,
          temperature: 0.6,
          stream: false,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Groq API error:", data.error?.message);

      return Response.json(
        {
          success: false,
          message: data.error?.message || "Permintaan Groq gagal.",
        },
        { status: response.status }
      );
    }

    const answer = data.choices?.[0]?.message?.content;

    return Response.json({
      success: true,
      message: answer
        ? "Koneksi dan respons AI berhasil!"
        : "Koneksi berhasil, tetapi respons AI masih kosong.",
      ai_response: answer || "",
      model: data.model,
      usage: data.usage,
    });
  } catch (error) {
    console.error("Groq connection error:", error);

    return Response.json(
      { success: false, message: "Gagal menghubungi Groq API." },
      { status: 500 }
    );
  }
}
