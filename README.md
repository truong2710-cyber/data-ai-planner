# Data AI Planner

A GitHub Pages planner for the **2026–2027 academic year**, containing **58 courses and 411 sessions**.

## Setup

1. Extract the ZIP and upload **all files and folders inside it** to the repository root:
   `truong2710-cyber/data-ai-planner`

   * Do not upload the ZIP itself.
   * `index.html` must be at the repository root.
2. Make sure `.github/workflows/deploy.yml` exists.
3. Go to **Settings → Pages → Build and deployment → Source** and select **GitHub Actions**.
4. Go to **Actions → Update and deploy planner → Run workflow**, select `main`, and run it.
5. The website will be available at:
   `https://truong2710-cyber.github.io/data-ai-planner/`

No API key, personal token, or ChatGPT plugin is required.

## Automatic Updates

* Runs daily at **04:17 UTC**.
* Fetches the latest official course and schedule data.
* Updates course information, sessions, rooms, instructors, ECTS, prerequisites, and related data.
* Validates the data before deployment.
* If the official source fails or the data structure changes unexpectedly, deployment is stopped and the previous version remains online.
* Automatic updates stop after **September 1, 2027** until the new academic year is reviewed.

## Local Validation

Requires **Python 3.11+** and **Node.js**:

```bash
python3 -m unittest discover -s scripts -p 'test_*.py'
python3 scripts/update_data.py
node scripts/validate-data.cjs
```

## Data Status

Snapshot verified on **September 24, 2026**:

* 58 courses
* 411 sessions
* Official ICS schedules validated
* Update and failure-handling tests completed

GitHub Actions must be run once after setup to verify direct access to the official data source.
