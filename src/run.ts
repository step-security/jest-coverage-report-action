import { setFailed, setOutput } from '@actions/core';
import * as core from '@actions/core';
import { context, getOctokit } from '@actions/github';
import axios, { isAxiosError } from 'axios';

import { createCoverageAnnotations } from './annotations/createCoverageAnnotations';
import { createFailedTestsAnnotations } from './annotations/createFailedTestsAnnotations';
import { onlyChanged } from './filters/onlyChanged';
import { formatCoverageAnnotations } from './format/annotations/formatCoverageAnnotations';
import { formatFailedTestsAnnotations } from './format/annotations/formatFailedTestsAnnotations';
import { generateCommitReport } from './report/generateCommitReport';
import { generatePRReport } from './report/generatePRReport';
import { checkThreshold } from './stages/checkThreshold';
import { createReport } from './stages/createReport';
import { createRunReport } from './stages/createRunReport';
import { getCoverage } from './stages/getCoverage';
import {
    checkoutRef,
    getCurrentBranch,
    switchBranch,
} from './stages/switchBranch';
import { JsonReport } from './typings/JsonReport';
import { getOptions } from './typings/Options';
import { createDataCollector, DataCollector } from './utils/DataCollector';
import { getNormalThreshold } from './utils/getNormalThreshold';
import { getPrPatch } from './utils/getPrPatch';
import { i18n } from './utils/i18n';
import { runStage } from './utils/runStage';
import { upsertCheck } from './utils/upsertCheck';

export const run = async (
    dataCollector = createDataCollector<JsonReport>()
) => {
    await validateSubscription();

    const [isInitialized, options] = await runStage(
        'initialize',
        dataCollector,
        getOptions
    );
    const isInPR = !!options?.pullRequest;

    if (!isInitialized || !options) {
        throw Error('Initialization failed.');
    }

    const [isThresholdParsed, threshold] = await runStage(
        'parseThreshold',
        dataCollector,
        () => {
            return getNormalThreshold(
                options.workingDirectory ?? process.cwd(),
                options.threshold
            );
        }
    );

    const [, initialBranch] = await runStage(
        'getBranch',
        dataCollector,
        (skip) => {
            if (!isInPR) {
                skip();
            }

            return getCurrentBranch();
        }
    );

    const [isHeadSwitched] = await runStage(
        'switchToHead',
        dataCollector,
        async (skip) => {
            const head = options?.pullRequest?.head;

            // no need to switch branch when:
            // - this is not a PR
            // - this is the PR head branch
            // - a head coverage is provided
            if (!isInPR || !head || !!options.coverageFile) {
                skip();
            }

            await checkoutRef(head!, 'covbot-pr-head-remote', 'covbot/pr-head');
        }
    );

    const [isHeadCoverageGenerated, headCoverage] = await runStage(
        'headCoverage',
        dataCollector,
        async (skip) => {
            if (isInPR && !isHeadSwitched && !options.coverageFile) {
                skip();
            }

            return await getCoverage(
                dataCollector,
                options,
                false,
                options.coverageFile
            );
        }
    );

    if (headCoverage) {
        dataCollector.add(headCoverage);
    }

    const [isSwitched] = await runStage(
        'switchToBase',
        dataCollector,
        async (skip) => {
            const base = options?.pullRequest?.base;

            // no need to switch branch when:
            // - this is not a PR
            // - this is the PR base branch
            // - a base coverage is provided
            if (!isInPR || !base || !!options.baseCoverageFile) {
                skip();
            }

            await checkoutRef(base!, 'covbot-pr-base-remote', 'covbot/pr-base');
        }
    );

    const ignoreCollector = createDataCollector<JsonReport>();

    const [, baseCoverage] = await runStage(
        'baseCoverage',
        dataCollector,
        async (skip) => {
            if (!isSwitched && !isHeadSwitched && !options.baseCoverageFile) {
                skip();
            }

            return await getCoverage(
                ignoreCollector,
                options,
                true,
                options.baseCoverageFile
            );
        }
    );

    await runStage('switchBack', dataCollector, (skip) => {
        if (!initialBranch) {
            console.warn(
                'Not checked out to the original branch - failed to get it.'
            );
            skip();
        }

        return switchBranch(initialBranch!);
    });

    if (baseCoverage) {
        dataCollector.add(baseCoverage);
    }

    const [, thresholdResults] = await runStage(
        'checkThreshold',
        dataCollector,
        async (skip) => {
            if (!isHeadCoverageGenerated || !isThresholdParsed) {
                skip();
            }

            return checkThreshold(
                headCoverage!,
                threshold!,
                options.workingDirectory,
                dataCollector as DataCollector<unknown>
            );
        }
    );

    const [isRunReportGenerated, runReport] = await runStage(
        'generateRunReport',
        dataCollector,
        (skip) => {
            if (!isHeadCoverageGenerated) {
                skip();
            }

            return createRunReport(headCoverage!);
        }
    );

    await runStage('failedTestsAnnotations', dataCollector, async (skip) => {
        if (
            !isHeadCoverageGenerated ||
            !isRunReportGenerated ||
            !['all', 'failed-tests'].includes(options.annotations)
        ) {
            skip();
        }

        const failedAnnotations = createFailedTestsAnnotations(headCoverage!);

        const octokit = getOctokit(options.token);
        await upsertCheck(
            octokit,
            formatFailedTestsAnnotations(runReport!, failedAnnotations, options)
        );
    });

    await runStage('coverageAnnotations', dataCollector, async (skip) => {
        if (
            !isHeadCoverageGenerated ||
            !['all', 'coverage'].includes(options.annotations)
        ) {
            skip();
        }

        let coverageAnnotations = createCoverageAnnotations(headCoverage!);

        if (coverageAnnotations.length === 0) {
            skip();
        }

        const octokit = getOctokit(options.token);
        if (options.pullRequest?.number) {
            const patch = await getPrPatch(octokit, options);
            coverageAnnotations = onlyChanged(coverageAnnotations, patch);
        }
        await upsertCheck(
            octokit,
            formatCoverageAnnotations(coverageAnnotations, options)
        );
    });

    const [isReportContentGenerated, summaryReport] = await runStage(
        'generateReportContent',
        dataCollector,
        async () => {
            return createReport(
                dataCollector,
                runReport,
                options,
                thresholdResults ?? []
            );
        }
    );

    await runStage('publishReport', dataCollector, async (skip) => {
        if (!isReportContentGenerated || !options.output.includes('comment')) {
            skip();
        }

        const octokit = getOctokit(options.token);

        if (isInPR) {
            await generatePRReport(
                summaryReport!.text,
                options,
                context.repo,
                options.pullRequest as { number: number },
                octokit
            );
        } else {
            await generateCommitReport(
                summaryReport!.text,
                context.repo,
                octokit
            );
        }
    });

    await runStage('setOutputs', dataCollector, (skip) => {
        if (
            !isReportContentGenerated ||
            !options.output.includes('report-markdown')
        ) {
            skip();
        }

        if (options.output.includes('report-markdown')) {
            setOutput('report', summaryReport!.text);
        }
    });

    if (dataCollector.get().errors.length > 0) {
        setFailed(i18n('failed'));
    }
};

async function validateSubscription(): Promise<void> {
    const API_URL = `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/subscription`;

    try {
        await axios.get(API_URL, { timeout: 3000 });
    } catch (error) {
        if (isAxiosError(error) && error.response) {
            core.error(
                'Subscription is not valid. Reach out to support@stepsecurity.io'
            );
            process.exit(1);
        } else {
            core.info('Timeout or API not reachable. Continuing to next step.');
        }
    }
}
