"""Refresh the 2026–2027 official catalogue and linked calendars, atomically."""
import collections
import copy
import datetime as dt
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import urllib.request
from urllib.parse import urljoin, urlparse
from zoneinfo import ZoneInfo

BASE = 'https://dataai.telecom-paris.fr'
DATA = Path('Data AI program planner_files/data.js')
START, END = '2026-08-01', '2027-09-01'
PARIS = ZoneInfo('Europe/Paris')
ALIASES = {'APM_5AI01_TP': ['CSC_5AI01_TP'], 'APM_5CL11_TP': ['APM-0EL05-TP'], 'TSP-CSC7201': ['CSC7201']}

class CatalogueText(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts = []; self.skip = 0
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ('script', 'style'): self.skip += 1
        if tag in ('h2', 'h3'): self.parts.append('\n' + ('## ' if tag == 'h2' else '### '))
        elif tag in ('p', 'div', 'br', 'li'): self.parts.append('\n')
        if tag == 'a' and '/static/schedule/' in attrs.get('href', ''):
            self.parts.append('\nCALENDAR: ' + attrs['href'] + '\n')
    def handle_endtag(self, tag):
        if tag in ('script', 'style'): self.skip -= 1
        if tag in ('h2', 'h3', 'p', 'div', 'li'): self.parts.append('\n')
    def handle_data(self, text):
        if not self.skip: self.parts.append(text)

def fetch(url):
    if urlparse(url).scheme != 'https' or urlparse(url).netloc != urlparse(BASE).netloc:
        raise ValueError('Unexpected source URL: ' + url)
    request = urllib.request.Request(url, headers={'User-Agent': 'DataAI-Planner/1.0 (daily course calendar refresh)'})
    with urllib.request.urlopen(request, timeout=45) as response:
        if urlparse(response.url).netloc != urlparse(BASE).netloc:
            raise ValueError('Unexpected redirect')
        body = response.read(8_000_001)
        if len(body) > 8_000_000: raise ValueError('Source too large')
        return body.decode('utf-8-sig')

def catalogue(source):
    parser = CatalogueText(); parser.feed(source)
    text = ''.join(parser.parts)
    group = None; records = {}
    for block in re.split(r'(?=^##(?:#)? )', text, flags=re.M):
        heading = re.match(r'## Group\s+["“](.+?)["”]', block)
        if heading: group = heading[1].strip(); continue
        heading = re.match(r'### (.+)\s+\(([^()]+)\)\s*\n', block)
        if not heading: continue
        name, code = (x.strip() for x in heading.groups())
        teacher = re.search(r'This course is taught by\s+([^\n]+)', block)
        credits = re.findall(r'ECTS:\s*(\d+(?:\.\d+)?)', block)
        if not group or not teacher or not credits or code in records:
            raise ValueError('Incomplete or duplicate catalogue entry: ' + code)
        prereq = re.search(r'Prerequisites:\s*([^\n]+)', block)
        calendar = re.search(r'CALENDAR: (\S+)', block)
        # Escape external text because the existing planner inserts metadata into HTML.
        safe = lambda x: html.escape(' '.join(x.split()), quote=True)
        records[code] = dict(code=code, name=safe(name), group=safe(group),
            teacher=safe(teacher[1].rstrip('.')), ects=float(credits[-1]),
            prereq=safe(prereq[1]) if prereq else None,
            ics=urljoin(BASE, calendar[1]) if calendar else None)
    if len(records) < 40: raise ValueError('Catalogue incomplete or layout changed')
    return records

def calendar_events(source, code):
    source = re.sub(r'\r?\n[ \t]', '', source).replace('\r\n', '\n')
    if not source.strip().startswith('BEGIN:VCALENDAR') or not source.strip().endswith('END:VCALENDAR'):
        raise ValueError('Invalid/truncated calendar for ' + code)
    if source.count('BEGIN:VEVENT') != source.count('END:VEVENT'):
        raise ValueError('Truncated event')
    results = []; rejected = 0
    norm = lambda s: re.sub('[^A-Za-z0-9]', '', s).upper()
    accepted = [norm(x) for x in [code] + ALIASES.get(code, [])]
    for block in re.findall(r'BEGIN:VEVENT\n(.*?)END:VEVENT', source, re.S):
        props = {}
        for line in block.splitlines():
            if ':' not in line: continue
            key, value = line.split(':', 1)
            props[key.split(';')[0]] = (key, value)
        if props.get('STATUS', ('', ''))[1] == 'CANCELLED': continue
        if any(k in props for k in ('RRULE', 'RDATE', 'EXDATE', 'RECURRENCE-ID')):
            raise ValueError('Recurring event needs review: ' + code)
        def unescape(s):
            return re.sub(r'\\([nN,;\\])', lambda m: '\n' if m[1] in 'nN' else m[1], s)
        summary = re.sub(r'^-\s*', '', unescape(props.get('SUMMARY', ('', ''))[1]).strip())
        if not any(x in norm(summary) for x in accepted): rejected += 1; continue
        def date(key):
            params, value = props[key]
            tz = re.search(r';TZID=([^;:]+)', params)
            result = dt.datetime.strptime(value.rstrip('Z'), '%Y%m%dT%H%M%S')
            result = result.replace(tzinfo=dt.timezone.utc if value.endswith('Z') else ZoneInfo(tz[1].strip('"')) if tz else PARIS)
            return result.astimezone(PARIS).isoformat(timespec='minutes')[:16]
        start, end = date('DTSTART'), date('DTEND')
        if start >= end: raise ValueError('Invalid event duration for ' + code)
        if not START <= start < END: rejected += 1; continue
        kind = re.search(r'\(([^()]*)\)$', summary)
        results.append(dict(s=start, e=end, sum=html.escape(summary),
            loc=html.escape(unescape(props.get('LOCATION', ('', ''))[1])), type=html.escape(kind[1]) if kind else ''))
    unique = {json.dumps(e, sort_keys=True): e for e in results}
    return sorted(unique.values(), key=lambda e: (e['s'], e['e'], e['sum'])), rejected

def refresh(old, getter=fetch):
    records = catalogue(getter(BASE + '/courses'))
    new = copy.deepcopy(old)
    existing = {c['code']: c for c in new['courses']}
    missing = set(existing) - set(records)
    if missing:
        # A removed/renamed course may affect selected courses and credit rules.
        raise ValueError('Courses removed/renamed; manual review required: ' + ', '.join(sorted(missing)))
    for code, record in records.items():
        course = existing.get(code)
        if course is None:
            course = dict(code=code, kind='dataai', desc=record['name'],
                color='Red' if code.endswith('_EP') else 'SeaGreen', note=None, mandatory_group=None)
            new['courses'].append(course)
        url = record['ics']
        for key in ('name', 'group', 'teacher', 'ects', 'prereq'): course[key] = record[key]
        events, rejected = calendar_events(getter(url), code) if url else ([], 0)
        if course.get('events') and not events:
            raise ValueError('Previously populated calendar now empty: ' + code)
        course.update(ics=urlparse(url).path if url else None,
            feed_id=urlparse(url).path.rsplit('/', 1)[-1] if url else None,
            events=events, has_cal=bool(events), slot=None)
        if events:
            slots = collections.Counter((dt.datetime.fromisoformat(e['s']).strftime('%a'), e['s'][11:], e['e'][11:]) for e in events)
            day, start, end = slots.most_common(1)[0][0]
            course['slot'] = f'{day} {start}-{end} ({len(events)} sessions)'
            if code not in ('APM_5AI01_TP', 'CSC_5AI31_TP', 'CSC_51054_EP'): course['note'] = None
            if code == 'CSC_51054_EP': course['note'] = 'Course inclusion was pending in the catalogue announcement; confirm eligibility with the coordinator.'
        elif course.get('kind') not in ('project', 'internship') and code != 'CSC_51054_EP':
            course['note'] = 'No verified 2026-2027 sessions in the linked calendar.' if url else 'No session calendar linked in the current catalogue.'
        print(f'{code}: {len(events)} sessions; {rejected} out-of-year or other-course events ignored')
    # Keep academic eligibility/credit requirements unchanged; these require coordinator review.
    new['generated'] = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None).isoformat(timespec='seconds')
    return new

def main():
    source = DATA.read_text(encoding='utf-8')
    old = json.loads(source.split('var DATA_AI =', 1)[1].strip().rstrip(';'))
    if dt.date.today().isoformat() >= END:
        raise ValueError('2026-2027 has ended: review academic-year configuration before updating')
    new = refresh(old)
    temporary = DATA.with_suffix('.tmp')
    temporary.write_text('// Updated from official Data AI catalogue and calendars.\nvar DATA_AI = ' + json.dumps(new, ensure_ascii=False) + ';\n', encoding='utf-8')
    temporary.replace(DATA)

if __name__ == '__main__': main()
