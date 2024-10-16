# jest coverage report 🧪

<p align="center">
  <img alt="PR Comment example" width="540" src="./img/Github-comment-screenshot.jpg">
</p>

<p align="center">
    A GitHub action that reports about your code coverage in every pull request.
</p>


This action uses [Jest](https://github.com/facebook/jest) to extract code coverage, and comments it on pull request. Inspired by [Size-limit action](https://github.com/andresz1/size-limit-action/). Features:

-   **Reporting** code coverage on each pull request. 📃
-   **Rejecting** pull request, if coverage is under threshold. ❌
-   **Comparing** coverage with base branch. 🔍
-   Showing spoiler in the comment for all **new covered files**. 🆕
-   Showing spoiler in the comment for all files, in which **coverage was reduced**. 🔻
-   Failed tests & uncovered line **annotations** 📢

<p align="center">
  <img alt="PR Comment example" width="540" src="./img/Rejected-PR-screenshot.jpg">
</p>

## Usage

1. Install and configure [Jest](https://github.com/facebook/jest).
2. Create new action inside `.github/workflows`:

**Minimal configuration**

```yml
name: 'coverage'
on:
    pull_request:
        branches:
            - master
            - main
jobs:
    coverage:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v3
            - uses: step-security/jest-coverage-report-action@v2
```

3. Pay attention to the action parameters. You can specify custom [threshold](#specify-threshold) or [test script](#customizing-test-script)
4. That's it!

## Forks with no write permission

If you're seeing this error in your action's console:

```
HttpError: Resource not accessible by integration
    at /home/runner/work/_actions/step-security/jest-coverage-report-action/v2/dist/index.js:8:323774
    at processTicsAndRejections (node:internal/process/task_queues:96:5)
    at async /home/runner/work/_actions/step-security/jest-coverage-report-action/v2/dist/index.js:64:2535
    at async Ie (/home/runner/work/_actions/step-security/jest-coverage-report-action/v2/dist/index.js:63:156)
    at async S_ (/home/runner/work/_actions/step-security/jest-coverage-report-action/v2/dist/index.js:64:2294)
```

> **Warning**
>
> This brings worse DX - you can test action only when it is merged into your main branch. **Any changes to the workflow file will be taken only after merging them to the main branch**

## Custom token

By default, this action takes `github.token` variable to publish reports on your PR. You can overwrite this property by specifying:

```yml
with:
    github-token: ${{ secrets.SECRET_TOKEN }}
```

## Specify threshold

This action automatically suports jest's [`coverageThreshold`](https://jestjs.io/docs/configuration#coveragethreshold-object) property.
Just add into your `jest.config.js` file:

```js
module.exports = {
    coverageThreshold: {
        global: {
            lines: 80,
        },
    },
};
```

## Custom working directory

If you want to run this action in custom directory, specify `working-directory`:

```yml
with:
    working-directory: <dir>
```

## Customizing test script

This action automatically adds necessary flags to your test script. The default script is:

```
npx jest
```

So you don't need to specify additional flags - action will handle them
automatically. So, after adding necessary flags, action will run this command:

```
npx jest --ci --json --coverage --testLocationInResults --outputFile=report.json
```

But you do not need to specify these flags manually. Also, you can use different package manager, `yarn` for example:

```yml
with:
    test-script: yarn jest
```

Or, if you would like to run a script from your `package.json`:

```yml
with:
    test-script: npm test
```

## Usage with `yarn` `pnpm`, or `bun`

By default, this action will install your dependencies using `npm`. If you are using `yarn`, `pnpm`, or `bun`, you can specify it in the `package-manager` option:

```yml
with:
    package-manager: yarn
```

or

```yml
with:
    package-manager: pnpm
```

or

```yml
with:
    package-manager: bun
```

## Use existing test report(s)

To bypass running unit tests, you can pass the filepath to the current report.json

```yml
with:
    coverage-file: ./coverage/report.json
    base-coverage-file: ./coverage/master/report.json
```

-   `coverage-file` is the filepath to the JSON coverage report for the current pull request.
-   `base-coverage-file` is the filepath to the JSON coverage report from the branch your pull request is merging into.

For example, you can save every test run to an artifact and then download and reference them here.

## Opt-out coverage comparison features

You can opt-out coverage comparison features to speed-up action. To achieve this, firstly, manually collect coverage to `report.json` file. Then, specify these options for the action:

```yml
with:
    coverage-file: report.json
    base-coverage-file: report.json
```

## Skipping steps

> Note: this option affects only coverage for the "head" branch. For skipping steps of "base" branch, see [`base-coverage-file`](#use-existing-test-reports) option.

By default, this action will install dependencies and run the tests for you, generating the coverage report. Alternatively, you can skip these steps using the `skip-step` option.

```yml
with:
    skip-step: all
```

Accepted values are:

-   `none` (default) - all steps will be run
-   `install` - skip installing dependencies
-   `all` - skip installing dependencies _and_ running the test script

## Change annotations

To change annotations, you have to set the annotations option as shown below:

```yml
with:
    annotations: none
```

Accepted values are:

-   `all` (default) - Will annotate sections of your code that failed tests or test did not cover
-   `none` - Turns off annotations
-   `coverage` - Will annotate those sections of your code that test did not cover. Limited to changed lines when used on a Pull Request
-   `failed-tests` - Will annotate those sections of your code that failed test

## Outputs

By default, action attaches comment to a pull request or commit. However, if you want to use other action for publishing report, you can specify `output: report-markdown`:

```yaml
- uses: step-security/jest-coverage-report-action@v2
    # give the id for the step, to access outputs in another step.
    id: coverage
    with:
        # tell to the action to not attach comment.
        output: report-markdown
- uses: marocchino/sticky-pull-request-comment@v2
    with:
        # pass output from the previous step by id.
        message: ${{ steps.coverage.outputs.report }}
```

Also, you can use this data on other platforms. For instance, you can send report to your [Slack](https://github.com/slackapi/slack-github-action) or [Jira](https://github.com/atlassian/gajira-comment).

> **Note**: Working examples of integrations with different platforms are much appreciated! Feel free to open a [PR](https://github.com/step-security/jest-coverage-report-action/pulls).

Available options are:
* `comment` - Attach comment to PR or commit, depending on event type, which triggered an action.
* `report-markdown` - Generate output "report", with report contents in markdown format.

Also, you can combine these options:

```yml
with:
    # This will attach comment to a PR and generate markdown output.
    output: comment, report-markdown
```

## Pull Request Number

If you are using the `push` event to trigger this action, by default it does not know which PR to comment on or the base branch of the PR to compare code coverage with.

You can pass the `prnumber` to the action so that coverage change can be run and comments will be updated on each push, instead of creating a new comment with each run of the action.

You can find the PR number with a number of methods, the [jwalton/gh-find-current-pr](https://github.com/jwalton/gh-find-current-pr) action makes it easy:

```yml
name: 'coverage'
on:
    push:
        branches:
            - master
            - main
jobs:
    coverage:
        permissions:
            checks: write
            pull-requests: write
            contents: write
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v1
            - uses: jwalton/gh-find-current-pr@v1
                id: findPr
            - uses: step-security/jest-coverage-report-action@v2
                with:
                   prnumber: ${{ steps.findPr.outputs.number }}
```

## Customizing report title

If you're running this action multiple times (for instance, when dealing with monorepos), you'll need to distinguish reports from different runs. To do so, you can use the `custom-title` property:

```yaml
with:
    custom-title: Coverage report for backend
```
