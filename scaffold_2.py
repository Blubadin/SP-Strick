import os

base_dir = "c:/Users/Sport-Science-R3909/Documents/Sp strick"

files = {
    "src/i18n/index.ts": """
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import th from './th.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      th: { translation: th }
    },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
""",
    "src/i18n/en.json": """
{
  "app.name": "SP Stick",
  "app.new_session": "New Session",
  "app.resume_session": "Resume Session",
  "app.sessions": "Sessions",
  "app.controller": "Controller",
  "app.settings": "Settings",
  "app.language": "Language",
  "controller.connected": "Controller Connected",
  "controller.disconnected": "Controller Disconnected",
  "controller.connect_instruction": "Connect your controller using USB or Bluetooth through your device settings.",
  "controller.press_any": "Press any controller button.",
  "controller.reconnect_instruction": "Reconnect the controller and press any button.",
  "scout.skill": "Skill",
  "scout.zone": "Zone",
  "scout.result": "Result",
  "scout.saved": "Saved",
  "scout.undo": "Last event removed",
  "scout.no_events": "No events recorded yet.",
  "team.a": "Team A",
  "team.b": "Team B",
  "skill.serve": "Serve",
  "skill.receive": "Receive",
  "skill.set": "Set",
  "skill.attack": "Attack",
  "skill.block": "Block",
  "skill.dig": "Dig",
  "skill.freeball": "Free Ball",
  "skill.other": "Other",
  "zone.1": "Zone 1",
  "zone.2": "Zone 2",
  "zone.3": "Zone 3",
  "zone.4": "Zone 4",
  "zone.5": "Zone 5",
  "zone.6": "Zone 6",
  "result.positive": "+1",
  "result.neutral": "0",
  "result.negative": "-1"
}
""",
    "src/i18n/th.json": """
{
  "app.name": "SP Stick",
  "app.new_session": "เซสชันใหม่",
  "app.resume_session": "ดำเนินการเซสชันต่อ",
  "app.sessions": "เซสชัน",
  "app.controller": "จอยสติ๊ก",
  "app.settings": "การตั้งค่า",
  "app.language": "ภาษา",
  "controller.connected": "เชื่อมต่อจอยแล้ว",
  "controller.disconnected": "จอยถูกตัดการเชื่อมต่อ",
  "controller.connect_instruction": "เชื่อมต่อจอยของคุณผ่าน USB หรือ Bluetooth ในการตั้งค่าอุปกรณ์",
  "controller.press_any": "กดปุ่มใดก็ได้บนจอย",
  "controller.reconnect_instruction": "เชื่อมต่อจอยอีกครั้งแล้วกดปุ่มใดก็ได้",
  "scout.skill": "ทักษะ",
  "scout.zone": "ตำแหน่ง",
  "scout.result": "ผลลัพธ์",
  "scout.saved": "บันทึกแล้ว",
  "scout.undo": "ย้อนกลับรายการล่าสุด",
  "scout.no_events": "ยังไม่มีรายการที่บันทึก",
  "team.a": "ทีม A",
  "team.b": "ทีม B",
  "skill.serve": "เสิร์ฟ",
  "skill.receive": "รับ",
  "skill.set": "เซต",
  "skill.attack": "ตบ",
  "skill.block": "บล็อก",
  "skill.dig": "ขุด",
  "skill.freeball": "บอลฟรี",
  "skill.other": "อื่นๆ",
  "zone.1": "หลังขวา",
  "zone.2": "หน้าขวา",
  "zone.3": "หน้ากลาง",
  "zone.4": "หน้าซ้าย",
  "zone.5": "หลังซ้าย",
  "zone.6": "หลังกลาง",
  "result.positive": "+1",
  "result.neutral": "0",
  "result.negative": "-1"
}
"""
}

for path, content in files.items():
    full_path = os.path.join(base_dir, path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, 'w', encoding='utf-8') as f:
        f.write(content.strip() + '\n')
