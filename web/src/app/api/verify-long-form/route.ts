import { NextRequest, NextResponse } from "next/server";

import {
  isLongFormVerificationValidationFailed,
  type RunLongFormVerificationOptions,
} from "@/lib/harness";
import {
  buildLongFormVerificationProgrammaticRunResponse,
  createLongFormVerificationProgrammaticRunRequest,
  runLongFormVerificationWorkflow,
  type LongFormVerificationRunInput,
} from "@/lib/orchestration";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RunLongFormVerificationOptions & {
      budgetUsd?: number | null;
      runId?: string;
    };
    const workflowInput: LongFormVerificationRunInput = {
      workflow: "long_form_verification",
      ...(body.runId ? { runId: body.runId } : {}),
      preset: body.preset,
      outDir: body.outDir,
      budgetUsd: body.budget ?? body.budgetUsd,
      verbose: body.verbose,
      scenario: body.scenario,
      scenarioPath: body.scenarioPath,
    };
    const contractRequest = createLongFormVerificationProgrammaticRunRequest({
      input: workflowInput,
      preset: workflowInput.preset ?? "default",
      outDir: workflowInput.outDir,
      verbose: workflowInput.verbose ?? true,
      budgetUsd: workflowInput.budgetUsd ?? null,
    });
    const workflowResult = await runLongFormVerificationWorkflow({
      input: workflowInput,
    });
    const result = workflowResult.payload?.result;

    if (!result) {
      throw new Error(
        workflowResult.errors[0]?.message
        ?? "장편 검증 워크플로가 결과를 반환하지 않았습니다.",
      );
    }

    const validationFailed =
      result.validationFailed
      ?? isLongFormVerificationValidationFailed(result);

    return NextResponse.json({
      run: buildLongFormVerificationProgrammaticRunResponse({
        request: contractRequest,
        workflowResult,
        result,
      }),
      scenario: {
        id: result.scenario.id,
        totalEpisodes: result.scenario.totalEpisodes,
      },
      validationFailed,
      contradictionValidation: result.contradictionValidation,
      report: result.report,
      artifactPaths: result.artifactPaths,
    }, {
      status: validationFailed ? 409 : 200,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "장편 검증 실행 실패",
      },
      { status: 500 },
    );
  }
}
