import { NextResponse } from "next/server";
import { z } from "zod";
import { completeConditionnementCartons } from "@/lib/services/workflow-service";
import { apiErrorResponse } from "@/lib/utils/api-response";

const schema = z.object({
  cartons: z.array(z.string().trim().min(1).max(500)).min(1).max(25),
  observations: z.string().trim().max(2_000).optional(),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    return NextResponse.json(await completeConditionnementCartons(input.cartons, input.observations));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
