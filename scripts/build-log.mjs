#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fetchDay } from '../src/fetch.mjs';
import { renderLog } from '../src/render.mjs';

function parseArgs(argv) {
  const args = { date: null, stdout: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--stdout') args.stdout = true;
    else if (argv[i] === '--date') args.date = argv[++i];
    else throw new Error(`알 수 없는 인자: ${argv[i]}`);
  }
  return args;
}

/**
 * 기록 대상 날짜 (Asia/Seoul, YYYY-MM-DD).
 * Actions schedule 이 자정을 넘겨 지연 실행돼도 그 전날이 기록되도록,
 * KST 정오 이전 실행은 전날로 본다.
 */
function todayKst() {
  const shifted = new Date(Date.now() - 12 * 60 * 60 * 1000);
  return shifted.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

const args = parseArgs(process.argv.slice(2));
const date = args.date ?? todayKst();
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error(`날짜 형식이 잘못됐습니다: ${date} (YYYY-MM-DD)`);
  process.exit(2);
}

const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
if (!token) {
  console.error('GH_TOKEN (또는 GITHUB_TOKEN) 환경변수가 필요합니다.');
  process.exit(2);
}

let day;
let failed = false;
try {
  day = await fetchDay(token, date);
} catch (error) {
  failed = true;
  day = {
    date,
    status: 'error',
    graphCount: null,
    error: error.message,
    repos: [],
    prs: [],
    issues: [],
    reviews: [],
  };
}

const content = renderLog(day);

if (args.stdout) {
  process.stdout.write(content);
} else {
  const path = `logs/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}.md`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
  console.error(`${path} (status: ${day.status})`);
}

// 수집 실패한 날에도 파일은 남기지만, 잡 자체는 실패로 끝낸다.
if (failed) process.exit(1);
