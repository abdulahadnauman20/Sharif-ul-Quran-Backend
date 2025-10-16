import express from 'express'
import pool from '../config/db.js'
import { authenticateToken } from '../middlewares/authMiddleware.js'

// Detect whether the DB uses qari_id or user_id for availability owner
let availabilityOwnerCol = 'qari_id'
let availabilityOwnerColChecked = false
async function ensureAvailabilityOwnerColumn() {
  if (availabilityOwnerColChecked) return availabilityOwnerCol
  try {
    const res = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'availability_slots' AND column_name IN ('qari_id','user_id')
       ORDER BY case when column_name='qari_id' then 0 else 1 end
       LIMIT 1`
    )
    const name = res.rows?.[0]?.column_name
    if (name === 'user_id' || name === 'qari_id') availabilityOwnerCol = name
  } catch { /* ignore, default stays */ }
  availabilityOwnerColChecked = true
  return availabilityOwnerCol
}

const router = express.Router()

// Get availability for a qari in a month (public endpoint)
router.get('/availability', async (req, res) => {
  try {
    const { qariId, year, month } = req.query
    const y = Number(year), m = Number(month)
    if (!y || !m) return res.status(400).json({ success: false, message: 'year and month are required' })
    
    const start = new Date(y, m - 1, 1)
    const end = new Date(y, m, 0)
    const ownerCol = await ensureAvailabilityOwnerColumn()
    
    console.log('GET availability - qariId:', qariId, 'year:', y, 'month:', m, 'start:', start, 'end:', end)
    
    let query, params
    
    if (qariId) {
      // Get availability for specific qari
      query = `SELECT slot_id, slot_date, start_time, end_time, capacity
               FROM availability_slots
               WHERE ${ownerCol} = $1 AND slot_date BETWEEN $2 AND $3
               ORDER BY slot_date, start_time`
      params = [Number(qariId), start, end]
    } else {
      // Get all public availability (for students to see all qaris)
      query = `SELECT slot_id, slot_date, start_time, end_time, capacity, ${ownerCol} as qari_id
               FROM availability_slots
               WHERE slot_date BETWEEN $1 AND $2
               ORDER BY slot_date, start_time`
      params = [start, end]
    }
    
    console.log('GET availability query:', query, 'params:', params)
    const result = await pool.query(query, params)
    console.log('GET availability result:', result.rows.length, 'slots found')
    res.json({ success: true, data: { slots: result.rows } })
  } catch (e) {
    console.error('availability get error', e)
    res.status(500).json({ success: false, message: 'Internal error' })
  }
})

// Bulk delete availability slots (qari only) - MUST come before /:slotId route
router.delete('/availability/bulk', authenticateToken, async (req, res) => {
  try {
    console.log('Bulk delete request body:', req.body)
    console.log('User ID:', req.user?.userId)
    console.log('User object:', req.user)
    
    if (!req.user || !req.user.userId) {
      console.log('No user or userId found in request')
      return res.status(401).json({ success: false, message: 'User not authenticated' })
    }
    
    const { dates, startDate, endDate, weekStartDate } = req.body
    const ownerCol = await ensureAvailabilityOwnerColumn()
    
    console.log('Owner column:', ownerCol)
    
    let query, params
    
    if (dates && Array.isArray(dates) && dates.length > 0) {
      // Delete slots for specific dates
      const placeholders = dates.map((_, index) => `$${index + 2}`).join(',')
      query = `DELETE FROM availability_slots 
               WHERE ${ownerCol} = $1 AND slot_date IN (${placeholders})`
      params = [req.user.userId, ...dates]
    } else if (startDate && endDate) {
      // Delete slots for date range
      query = `DELETE FROM availability_slots 
               WHERE ${ownerCol} = $1 AND slot_date BETWEEN $2 AND $3`
      params = [req.user.userId, startDate, endDate]
    } else if (weekStartDate) {
      // Delete slots for a week (7 days starting from weekStartDate)
      const weekEndDate = new Date(weekStartDate)
      weekEndDate.setDate(weekEndDate.getDate() + 6)
      query = `DELETE FROM availability_slots 
               WHERE ${ownerCol} = $1 AND slot_date BETWEEN $2 AND $3`
      params = [req.user.userId, weekStartDate, weekEndDate.toISOString().split('T')[0]]
    } else {
      console.log('No valid delete parameters provided')
      return res.status(400).json({ success: false, message: 'dates, startDate/endDate, or weekStartDate required' })
    }
    
    console.log('Bulk delete query:', query, 'params:', params)
    const result = await pool.query(query, params)
    console.log('Bulk deleted', result.rowCount, 'slots')
    
    res.json({ 
      success: true, 
      message: `Successfully deleted ${result.rowCount} slot(s)`,
      deletedCount: result.rowCount
    })
  } catch (e) {
    console.error('bulk delete availability error:', e.message)
    console.error('Full error:', e)
    res.status(500).json({ success: false, message: 'Internal error: ' + e.message })
  }
})

// Delete availability slot (qari only) - MUST come after /bulk route
router.delete('/availability/:slotId', authenticateToken, async (req, res) => {
  try {
    const { slotId } = req.params
    const ownerCol = await ensureAvailabilityOwnerColumn()
    
    const result = await pool.query(
      `DELETE FROM availability_slots 
       WHERE slot_id = $1 AND ${ownerCol} = $2`,
      [slotId, req.user.userId]
    )
    
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Slot not found or not authorized' })
    }
    
    res.json({ success: true, message: 'Slot deleted successfully' })
  } catch (e) {
    console.error('delete availability error', e)
    res.status(500).json({ success: false, message: 'Internal error' })
  }
})

// Upsert availability (qari only)
router.put('/availability', authenticateToken, async (req, res) => {
  try {
    const { slots } = req.body // [{slot_date, start_time, capacity}]
    console.log('PUT availability - received slots:', slots)
    if (!Array.isArray(slots) || slots.length === 0) return res.status(400).json({ success: false, message: 'slots required' })
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (const s of slots) {
        if (!s.slot_date || !s.start_time) continue
        console.log('Processing slot:', s)
        const [h, m] = String(s.start_time).split(':').map(Number)
        const startH = isNaN(h) ? 0 : h
        const startM = isNaN(m) ? 0 : m
        const start_time = `${String(startH).padStart(2,'0')}:${String(startM).padStart(2,'0')}:00`
        // Use provided end_time if present; otherwise default to +60 minutes
        let end_time = s.end_time
        if (!end_time) {
          const endMinutes = startH * 60 + startM + 60
          const eH = String(Math.floor(endMinutes / 60) % 24).padStart(2, '0')
          const eM = String(endMinutes % 60).padStart(2, '0')
          end_time = `${eH}:${eM}:00`
        }
        const capacity = Number(s.capacity) > 0 ? Number(s.capacity) : 1

        const ownerCol = await ensureAvailabilityOwnerColumn()
        console.log('Inserting slot with:', { ownerCol, userId: req.user.userId, slot_date: s.slot_date, start_time, end_time, capacity })
        await client.query(
          `INSERT INTO availability_slots (${ownerCol}, slot_date, start_time, end_time, capacity)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (${ownerCol}, slot_date, start_time, end_time)
           DO UPDATE SET capacity = EXCLUDED.capacity, updated_at = NOW()`,
          [req.user.userId, s.slot_date, start_time, end_time, capacity]
        )
      }
      await client.query('COMMIT')
      console.log('Successfully saved', slots.length, 'slots')
      res.json({ success: true, message: 'Availability updated' })
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }
  } catch (e) {
    console.error('availability put error', e)
    res.status(500).json({ success: false, message: 'Internal error' })
  }
})

// Delete booking (student only)
router.delete('/bookings/:bookingId', authenticateToken, async (req, res) => {
  try {
    const { bookingId } = req.params
    
    const result = await pool.query(
      `DELETE FROM bookings 
       WHERE booking_id = $1 AND student_id = $2`,
      [bookingId, req.user.userId]
    )
    
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Booking not found or not authorized' })
    }
    
    res.json({ success: true, message: 'Booking cancelled successfully' })
  } catch (e) {
    console.error('delete booking error', e)
    res.status(500).json({ success: false, message: 'Internal error' })
  }
})

// Place a temporary hold (pre-payment)
router.post('/bookings/hold', authenticateToken, async (req, res) => {
  try {
    const { qariId, slot_date, start_time } = req.body
    if (!qariId || !slot_date || !start_time) return res.status(400).json({ success: false, message: 'missing fields' })

    // Find the availability slot and infer end_time
    const ownerCol = await ensureAvailabilityOwnerColumn()
    const avail = await pool.query(
      `SELECT end_time, capacity FROM availability_slots WHERE ${ownerCol}=$1 AND slot_date=$2 AND start_time=$3`,
      [qariId, slot_date, start_time]
    )
    if (avail.rowCount === 0) return res.status(404).json({ success: false, message: 'Slot not found' })
    const end_time = avail.rows[0].end_time
    const capacity = avail.rows[0].capacity || 1

    const now = new Date()
    await pool.query(`UPDATE bookings SET status='expired', updated_at=NOW() WHERE status='hold' AND expires_at < NOW()`) // cleanup

    const bookedRes = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM bookings
       WHERE qari_id=$1 AND slot_date=$2 AND start_time=$3 AND end_time=$4 AND status IN ('hold','confirmed')`,
      [qariId, slot_date, start_time, end_time]
    )
    const used = bookedRes.rows[0]?.cnt || 0
    if (used >= capacity) return res.status(409).json({ success: false, message: 'Slot fully booked' })

    const expiresAt = new Date(now.getTime() + 15 * 60000)
    const ins = await pool.query(
      `INSERT INTO bookings (qari_id, student_id, slot_date, start_time, end_time, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, 'hold', $6)
       RETURNING booking_id, expires_at`,
      [qariId, req.user.userId, slot_date, start_time, end_time, expiresAt]
    )
    res.json({ success: true, data: ins.rows[0] })
  } catch (e) {
    console.error('hold error', e)
    res.status(500).json({ success: false, message: 'Internal error' })
  }
})

router.post('/bookings/confirm', authenticateToken, async (req, res) => {
  try {
    const { booking_id } = req.body
    const upd = await pool.query(
      `UPDATE bookings SET status='confirmed', updated_at=NOW()
       WHERE booking_id=$1 AND student_id=$2 AND status='hold' AND expires_at > NOW()
       RETURNING booking_id`,
      [booking_id, req.user.userId]
    )
    if (upd.rowCount === 0) return res.status(400).json({ success: false, message: 'Hold expired or not found' })
    res.json({ success: true })
  } catch (e) {
    console.error('confirm error', e)
    res.status(500).json({ success: false, message: 'Internal error' })
  }
})

router.post('/bookings/cancel', authenticateToken, async (req, res) => {
  try {
    const { booking_id } = req.body
    const upd = await pool.query(
      `UPDATE bookings SET status='cancelled', updated_at=NOW()
       WHERE booking_id=$1 AND student_id=$2 AND status IN ('hold','confirmed')
       RETURNING booking_id`,
      [booking_id, req.user.userId]
    )
    if (upd.rowCount === 0) return res.status(400).json({ success: false, message: 'Booking not found' })
    res.json({ success: true })
  } catch (e) {
    console.error('cancel error', e)
    res.status(500).json({ success: false, message: 'Internal error' })
  }
})

export default router


