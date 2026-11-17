import 'package:flutter_test/flutter_test.dart';
import 'package:smart_reply/core/format.dart';

void main() {
  test('window countdown', () {
    final now = DateTime(2026, 11, 18, 10, 0);
    expect(windowLeft(now.add(const Duration(hours: 3, minutes: 5)), now), '3h 05m');
    expect(windowLeft(now.subtract(const Duration(minutes: 1)), now), isNull);
    expect(closingSoon(now.add(const Duration(minutes: 90)), now), isTrue);
    expect(closingSoon(now.add(const Duration(hours: 5)), now), isFalse);
  });

  test('durations and sizes', () {
    expect(duration(185), '3:05');
    expect(fileSize(2048), '2 KB');
    expect(replyTime(75), '1m 15s');
  });

  test('template variables', () {
    expect(templateVariables('Hi {{1}}, total {{2}} for {{1}}'), 2);
  });
}
