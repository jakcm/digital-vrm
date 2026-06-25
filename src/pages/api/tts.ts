import { synthesizeEdgeTTS } from "@/features/edgeTts/edgeTts";

import type { NextApiRequest, NextApiResponse } from "next";

type Data = {
  audio: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  // function currently not used - Edge TTS runs client-side
  throw new Error("Not implemented");

  /*
  const { message, voice } = req.body;
  const result = await synthesizeEdgeTTS(message, voice);
  
  // Convert ArrayBuffer to base64
  const base64 = Buffer.from(result.audioBuffer).toString('base64');
  
  res.status(200).json({ audio: base64 });
  */
}