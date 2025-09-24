// LINE Bot Server for Meeting Room Booking System
// Node.js + Express + LINE Messaging API

const express = require('express');
const line = require('@line/bot-sdk');
const bodyParser = require('body-parser');

const app = express();
const port = process.env.PORT || 3000;

// LINE Bot Configuration
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET // ใส่ Channel Secret จาก LINE Developers
};

const client = new line.Client(config);

// ข้อมูลห้องประชุม
const rooms = [
  { id: 1, name: 'ห้องประชุมใหญ่', capacity: 20, color: '#4285F4' },
  { id: 2, name: 'ห้องประชุมเล็ก', capacity: 8, color: '#34A853' },
  { id: 3, name: 'ห้องประชุมกลาง', capacity: 12, color: '#9C27B0' }
];

// จำลองฐานข้อมูล (ในการใช้งานจริงใช้ MongoDB/PostgreSQL)
let bookings = [];
let userSessions = {}; // เก็บ session การจองของแต่ละคน

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Webhook endpoint รับข้อความจาก LINE
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// ฟังก์ชันหลักจัดการ Event
async function handleEvent(event) {
  if (event.type !== 'message' && event.type !== 'postback') {
    return Promise.resolve(null);
  }

  const userId = event.source.userId;
  
  // จัดการ Postback (การกดปุ่ม)
  if (event.type === 'postback') {
    return handlePostback(event);
  }

  // จัดการข้อความ
  const message = event.message.text.toLowerCase().trim();

  switch (message) {
    case 'จอง':
    case 'book':
    case 'booking':
      return showRoomSelection(userId);
    
    case 'สถานะ':
    case 'status':
      return showRoomStatus(userId);
    
    case 'การจองของฉัน':
    case 'mybooking':
      return showMyBookings(userId);
    
    case 'help':
    case 'ช่วยเหลือ':
      return showHelp(userId);
    
    default:
      return handleBookingFlow(userId, message);
  }
}

// จัดการ Postback Actions
async function handlePostback(event) {
  const userId = event.source.userId;
  const data = event.postback.data;
  
  if (data.startsWith('room_')) {
    const roomId = parseInt(data.split('_')[1]);
    return startBookingProcess(userId, roomId);
  }
  
  if (data.startsWith('cancel_')) {
    const bookingId = data.split('_')[1];
    return cancelBooking(userId, bookingId);
  }
  
  if (data.startsWith('time_')) {
    const timeData = data.split('_');
    const startTime = timeData[1];
    const endTime = timeData[2];
    return selectTime(userId, startTime, endTime);
  }
}

// แสดงตัวเลือกห้องประชุม
async function showRoomSelection(userId) {
  const flexMessage = {
    type: 'flex',
    altText: 'เลือกห้องประชุม',
    contents: {
      type: 'carousel',
      contents: rooms.map(room => ({
        type: 'bubble',
        hero: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: room.name,
              weight: 'bold',
              size: 'xl',
              color: '#ffffff'
            }
          ],
          backgroundColor: room.color,
          paddingAll: '20px'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: '👥 ความจุ:',
                  size: 'sm',
                  color: '#666666'
                },
                {
                  type: 'text',
                  text: `${room.capacity} คน`,
                  size: 'sm',
                  weight: 'bold',
                  flex: 1
                }
              ]
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: '📊 สถานะ:',
                  size: 'sm',
                  color: '#666666'
                },
                {
                  type: 'text',
                  text: getRoomStatusText(room.id),
                  size: 'sm',
                  weight: 'bold',
                  color: getRoomStatusColor(room.id),
                  flex: 1
                }
              ]
            }
          ],
          spacing: 'md'
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              style: 'primary',
              height: 'sm',
              action: {
                type: 'postback',
                label: 'เลือกห้องนี้',
                data: `room_${room.id}`
              }
            }
          ]
        }
      }))
    }
  };

  return client.replyMessage(userId, flexMessage);
}

// เริ่มกระบวนการจอง
async function startBookingProcess(userId, roomId) {
  const room = rooms.find(r => r.id === roomId);
  
  // เก็บ session
  userSessions[userId] = {
    step: 'date',
    roomId: roomId
  };

  const replyMessage = {
    type: 'text',
    text: `📅 คุณเลือก ${room.name}\n\nกรุณาใส่วันที่จอง:\n\nตัวอย่าง:\n- วันนี้\n- พรุ่งนี้\n- 25/09/2567\n- 2024-09-25`,
    quickReply: {
      items: [
        {
          type: 'action',
          action: {
            type: 'message',
            label: 'วันนี้',
            text: 'วันนี้'
          }
        },
        {
          type: 'action',
          action: {
            type: 'message',
            label: 'พรุ่งนี้',
            text: 'พรุ่งนี้'
          }
        }
      ]
    }
  };

  return client.replyMessage(userId, replyMessage);
}

// จัดการขั้นตอนการจอง
async function handleBookingFlow(userId, message) {
  const session = userSessions[userId];
  if (!session) {
    return showHelp(userId);
  }

  switch (session.step) {
    case 'date':
      return handleDateInput(userId, message);
    case 'time':
      return handleTimeSelection(userId);
    case 'title':
      return handleTitleInput(userId, message);
    case 'organizer':
      return handleOrganizerInput(userId, message);
    default:
      return showHelp(userId);
  }
}

// จัดการการใส่วันที่
async function handleDateInput(userId, message) {
  let date;
  const today = new Date();
  
  if (message === 'วันนี้') {
    date = today.toISOString().split('T')[0];
  } else if (message === 'พรุ่งนี้') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    date = tomorrow.toISOString().split('T')[0];
  } else {
    // Parse date format
    date = parseDateString(message);
    if (!date) {
      return client.replyMessage(userId, {
        type: 'text',
        text: '❌ รูปแบบวันที่ไม่ถูกต้อง กรุณาลองใหม่:\n\nตัวอย่าง:\n- วันนี้\n- พรุ่งนี้\n- 25/09/2567\n- 2024-09-25'
      });
    }
  }

  // อัพเดท session
  userSessions[userId].date = date;
  userSessions[userId].step = 'time';

  return showTimeSelection(userId);
}

// แสดงตัวเลือกเวลา
async function showTimeSelection(userId) {
  const session = userSessions[userId];
  const availableSlots = getAvailableTimeSlots(session.roomId, session.date);

  if (availableSlots.length === 0) {
    return client.replyMessage(userId, {
      type: 'text',
      text: '❌ ไม่มีช่วงเวลาว่างในวันที่เลือก กรุณาเลือกวันอื่น'
    });
  }

  const quickReplyItems = availableSlots.slice(0, 10).map(slot => ({
    type: 'action',
    action: {
      type: 'postback',
      label: `${slot.start}-${slot.end}`,
      data: `time_${slot.start}_${slot.end}`
    }
  }));

  const replyMessage = {
    type: 'text',
    text: `⏰ เลือกช่วงเวลา (วันที่ ${formatDate(session.date)}):`,
    quickReply: {
      items: quickReplyItems
    }
  };

  return client.replyMessage(userId, replyMessage);
}

// เลือกเวลา
async function selectTime(userId, startTime, endTime) {
  userSessions[userId].startTime = startTime;
  userSessions[userId].endTime = endTime;
  userSessions[userId].step = 'title';

  return client.replyMessage(userId, {
    type: 'text',
    text: '📝 กรุณาใส่หัวข้อการประชุม:'
  });
}

// จัดการการใส่หัวข้อ
async function handleTitleInput(userId, message) {
  userSessions[userId].title = message;
  userSessions[userId].step = 'organizer';

  return client.replyMessage(userId, {
    type: 'text',
    text: '👤 กรุณาใส่ชื่อผู้จอง:'
  });
}

// จัดการการใส่ชื่อผู้จอง
async function handleOrganizerInput(userId, message) {
  const session = userSessions[userId];
  session.organizer = message;

  // สร้างการจอง
  const booking = {
    id: Date.now().toString(),
    userId: userId,
    roomId: session.roomId,
    title: session.title,
    organizer: session.organizer,
    date: session.date,
    startTime: session.startTime,
    endTime: session.endTime,
    status: 'confirmed'
  };

  bookings.push(booking);

  // ลบ session
  delete userSessions[userId];

  // ส่งการยืนยัน
  return sendBookingConfirmation(userId, booking);
}

// ส่งการยืนยันการจอง
async function sendBookingConfirmation(userId, booking) {
  const room = rooms.find(r => r.id === booking.roomId);
  
  const flexMessage = {
    type: 'flex',
    altText: 'การจองสำเร็จ',
    contents: {
      type: 'bubble',
      hero: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '✅ จองสำเร็จ!',
            weight: 'bold',
            size: 'xl',
            color: '#ffffff'
          }
        ],
        backgroundColor: '#34A853',
        paddingAll: '20px'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'รายละเอียดการจอง',
            weight: 'bold',
            size: 'lg',
            margin: 'md'
          },
          {
            type: 'separator',
            margin: 'md'
          },
          {
            type: 'box',
            layout: 'vertical',
            contents: [
              createDetailRow('🆔 รหัสจอง:', booking.id),
              createDetailRow('🏢 ห้อง:', room.name),
              createDetailRow('📋 หัวข้อ:', booking.title),
              createDetailRow('👤 ผู้จอง:', booking.organizer),
              createDetailRow('📅 วันที่:', formatDate(booking.date)),
              createDetailRow('⏰ เวลา:', `${booking.startTime} - ${booking.endTime}`)
            ],
            spacing: 'sm',
            margin: 'md'
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            style: 'secondary',
            height: 'sm',
            action: {
              type: 'postback',
              label: '❌ ยกเลิกการจอง',
              data: `cancel_${booking.id}`
            }
          }
        ]
      }
    }
  };

  return client.replyMessage(userId, flexMessage);
}

// แสดงสถานะห้องประชุม
async function showRoomStatus(userId) {
  const today = new Date().toISOString().split('T')[0];
  
  const statusMessage = rooms.map(room => {
    const todayBookings = bookings.filter(b => 
      b.roomId === room.id && 
      b.date === today && 
      b.status === 'confirmed'
    );

    let status = `🏢 *${room.name}* (${room.capacity} คน)\n`;
    
    if (todayBookings.length === 0) {
      status += '✅ ว่าง ทั้งวัน\n';
    } else {
      status += `📊 มีการจอง ${todayBookings.length} รายการ:\n`;
      todayBookings.forEach(booking => {
        status += `• ${booking.startTime}-${booking.endTime} ${booking.title}\n`;
      });
    }
    
    return status;
  }).join('\n');

  return client.replyMessage(userId, {
    type: 'text',
    text: `📊 สถานะห้องประชุม วันนี้ (${formatDate(today)}):\n\n${statusMessage}`
  });
}

// แสดงการจองของฉัน
async function showMyBookings(userId) {
  const myBookings = bookings.filter(b => b.userId === userId && b.status === 'confirmed');

  if (myBookings.length === 0) {
    return client.replyMessage(userId, {
      type: 'text',
      text: '📋 คุณยังไม่มีการจองห้องประชุม'
    });
  }

  const bookingList = myBookings.map(booking => {
    const room = rooms.find(r => r.id === booking.roomId);
    return `🆔 ${booking.id}\n🏢 ${room.name}\n📋 ${booking.title}\n📅 ${formatDate(booking.date)}\n⏰ ${booking.startTime}-${booking.endTime}\n`;
  }).join('\n---\n');

  return client.replyMessage(userId, {
    type: 'text',
    text: `📋 การจองของคุณ:\n\n${bookingList}`
  });
}

// ยกเลิกการจอง
async function cancelBooking(userId, bookingId) {
  const booking = bookings.find(b => b.id === bookingId && b.userId === userId);
  
  if (!booking) {
    return client.replyMessage(userId, {
      type: 'text',
      text: '❌ ไม่พบการจองนี้หรือคุณไม่มีสิทธิ์ยกเลิก'
    });
  }

  booking.status = 'cancelled';

  return client.replyMessage(userId, {
    type: 'text',
    text: `✅ ยกเลิกการจองสำเร็จ\nรหัสจอง: ${bookingId}`
  });
}

// แสดงความช่วยเหลือ
async function showHelp(userId) {
  const helpMessage = {
    type: 'text',
    text: `🤖 วิธีใช้งานระบบจองห้องประชุม:\n\n💬 คำสั่ง:\n• "จอง" - เริ่มจองห้องประชุม\n• "สถานะ" - ดูสถานะห้องวันนี้\n• "การจองของฉัน" - ดูการจองของคุณ\n• "ช่วยเหลือ" - แสดงข้อความนี้\n\n📞 ติดต่อ: IT Support`,
    quickReply: {
      items: [
        {
          type: 'action',
          action: {
            type: 'message',
            label: '🏢 จองห้อง',
            text: 'จอง'
          }
        },
        {
          type: 'action',
          action: {
            type: 'message',
            label: '📊 สถานะ',
            text: 'สถานะ'
          }
        }
      ]
    }
  };

  return client.replyMessage(userId, helpMessage);
}

// Helper Functions

function createDetailRow(label, value) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'text',
        text: label,
        size: 'sm',
        color: '#666666',
        flex: 2
      },
      {
        type: 'text',
        text: value,
        size: 'sm',
        weight: 'bold',
        flex: 3,
        wrap: true
      }
    ]
  };
}

function getRoomStatusText(roomId) {
  const today = new Date().toISOString().split('T')[0];
  const todayBookings = bookings.filter(b => 
    b.roomId === roomId && 
    b.date === today && 
    b.status === 'confirmed'
  );
  
  return todayBookings.length === 0 ? 'ว่าง' : `จอง ${todayBookings.length} รายการ`;
}

function getRoomStatusColor(roomId) {
  const today = new Date().toISOString().split('T')[0];
  const todayBookings = bookings.filter(b => 
    b.roomId === roomId && 
    b.date === today && 
    b.status === 'confirmed'
  );
  
  return todayBookings.length === 0 ? '#34A853' : '#EA4335';
}

function getAvailableTimeSlots(roomId, date) {
  const timeSlots = [
    { start: '08:00', end: '09:00' },
    { start: '09:00', end: '10:00' },
    { start: '10:00', end: '11:00' },
    { start: '11:00', end: '12:00' },
    { start: '13:00', end: '14:00' },
    { start: '14:00', end: '15:00' },
    { start: '15:00', end: '16:00' },
    { start: '16:00', end: '17:00' }
  ];

  const roomBookings = bookings.filter(b => 
    b.roomId === roomId && 
    b.date === date && 
    b.status === 'confirmed'
  );

  return timeSlots.filter(slot => {
    return !roomBookings.some(booking => 
      slot.start < booking.endTime && slot.end > booking.startTime
    );
  });
}

function parseDateString(dateStr) {
  // รองรับรูปแบบ DD/MM/YYYY และ YYYY-MM-DD
  const formats = [
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // DD/MM/YYYY
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/   // YYYY-MM-DD
  ];

  for (let format of formats) {
    const match = dateStr.match(format);
    if (match) {
      if (format === formats[0]) {
        // DD/MM/YYYY
        const [, day, month, year] = match;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      } else {
        // YYYY-MM-DD
        return dateStr;
      }
    }
  }
  return null;
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const options = { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    weekday: 'short'
  };
  return date.toLocaleDateString('th-TH', options);
}

// Start server
app.listen(port, () => {
  console.log(`🚀 LINE Bot server running on port ${port}`);
  console.log(`📞 Webhook URL: https://your-domain.com/webhook`);
});

// Export for serverless deployment
module.exports = app;