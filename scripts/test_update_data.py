import copy
import unittest
from unittest.mock import patch
import update_data as u

FEED = '''BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:20261005T070000Z
DTEND;TZID=Europe/Paris:20261005T110000
SUMMARY: - CSC_TEST_TP (Cours magis
 tral)
LOCATION:Room 1\\, Building A
END:VEVENT
END:VCALENDAR
'''
class UpdaterTests(unittest.TestCase):
    def test_timezone_unfold_and_escaping(self):
        events, rejected = u.calendar_events(FEED, 'CSC_TEST_TP')
        self.assertEqual(rejected, 0)
        self.assertEqual(events[0]['s'], '2026-10-05T09:00')
        self.assertEqual(events[0]['e'], '2026-10-05T11:00')
        self.assertEqual(events[0]['type'], 'Cours magistral')
        self.assertEqual(events[0]['loc'], 'Room 1, Building A')
    def test_wrong_course_not_imported(self):
        self.assertEqual(u.calendar_events(FEED, 'OTHER_COURSE'), ([], 1))
    def test_truncated_and_recurring_feeds_fail(self):
        for feed in (FEED.replace('END:VCALENDAR', ''), FEED.replace('SUMMARY:', 'RRULE:FREQ=WEEKLY\nSUMMARY:')):
            with self.assertRaises(ValueError): u.calendar_events(feed, 'CSC_TEST_TP')
    def test_html_catalogue_and_incomplete_page(self):
        source = '<h2>Group &quot;Databases&quot;</h2>'
        for i in range(40):
            source += f'<h3>Course <em>{i}</em> (CSC_{i}_TP)</h3><p>This course is taught by Alice.</p><p>ECTS: 2.5</p><p>Prerequisites: Basics</p><a href="/static/schedule/{i}">Calendar</a>'
        records = u.catalogue(source)
        self.assertEqual(len(records), 40)
        self.assertEqual(records['CSC_0_TP']['name'], 'Course 0')
        self.assertEqual(records['CSC_0_TP']['ics'], u.BASE + '/static/schedule/0')
        with self.assertRaises(ValueError): u.catalogue('<h1>Temporarily unavailable</h1>')
    def test_fetch_failure_does_not_mutate_snapshot(self):
        old = {'courses': [{'code': 'CSC_TEST_TP', 'events': [{'s': 'existing'}]}]}
        before = copy.deepcopy(old)
        record = dict(code='CSC_TEST_TP', name='Test', group='Group', teacher='A', ects=2.5, prereq=None, ics=u.BASE+'/static/schedule/1')
        def getter(url):
            if url.endswith('/courses'): return 'html'
            raise OSError('source unavailable')
        with patch.object(u, 'catalogue', return_value={'CSC_TEST_TP': record}):
            with self.assertRaises(OSError): u.refresh(old, getter)
        self.assertEqual(old, before)
    def test_disappearing_events_fail(self):
        old = {'courses': [{'code': 'CSC_TEST_TP', 'events': [{}]}]}
        record = dict(code='CSC_TEST_TP', name='Test', group='Group', teacher='A', ects=2.5, prereq=None, ics=None)
        with patch.object(u, 'catalogue', return_value={'CSC_TEST_TP': record}):
            with self.assertRaises(ValueError): u.refresh(old, lambda _: '')
if __name__ == '__main__': unittest.main()
