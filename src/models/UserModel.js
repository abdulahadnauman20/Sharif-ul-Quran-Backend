import pool from '../config/db.js';
import bcrypt from 'bcryptjs';

class UserModel {
  // Create a user, and if role = student/qari, also insert into respective details tables
  static async createUser(userData) {
    const { name, email, password, userType, studentDetails, qariDetails } = userData;
    const hashedPassword = await bcrypt.hash(password, 12);

    // Force role lowercase
    const role = userType.toLowerCase();

    // Start transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Insert into users table
      const userQuery = `
        INSERT INTO users (full_name, email, password_hash, role, created_at)
        VALUES ($1, $2, $3, $4, NOW())
        RETURNING user_id, full_name, email, role, created_at
      `;
      const userValues = [name, email, hashedPassword, role];
      const userResult = await client.query(userQuery, userValues);
      const newUser = userResult.rows[0];

      // If Student, insert into student_details
      if (role === 'student' && studentDetails) {
        const { country, city, address, phoneNumber, dateOfBirth, guardianName, guardianPhone, learningGoal } = studentDetails;

        const studentQuery = `
          INSERT INTO student_details (user_id, country, city, address, phone_no, dob, guardian_name, guardian_phone, learning_goal, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          RETURNING student_id, user_id, country, city, address, phone_no, dob, guardian_name, guardian_phone, learning_goal
        `;
        const studentValues = [
          newUser.user_id,
          country || null,
          city || null,
          address || null,
          phoneNumber || null,
          dateOfBirth || null,
          guardianName || null,
          guardianPhone || null,
          learningGoal || null
        ];
        const studentResult = await client.query(studentQuery, studentValues);
        newUser.studentDetails = studentResult.rows[0];
      }

      // If Qari, insert into qari_details as well
      if (role === 'qari' && qariDetails) {
        const { country, city, address, phoneNumber, dateOfBirth, bio, certificateFile } = qariDetails;

        const qariQuery = `
          INSERT INTO qari_details (user_id, country, city, address, phone_no, dob, bio, monthly_fee, certificate_path, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, NOW())
          RETURNING qari_id, user_id, country, city, address, phone_no, dob, bio, certificate_path
        `;
        const qariValues = [
          newUser.user_id,
          country || null,
          city || null,
          address || null,
          phoneNumber || null,
          dateOfBirth || null,
          bio || null,
          certificateFile || null,
        ];
        const qariResult = await client.query(qariQuery, qariValues);
        newUser.qariDetails = qariResult.rows[0];
      }

      await client.query('COMMIT');
      return newUser;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async findUserByEmail(email) {
    const query = `
      SELECT 
        u.*, 
        sd.country as student_country, sd.city as student_city, sd.address as student_address, 
        sd.phone_no as student_phone, sd.dob as student_dob, sd.guardian_name, sd.guardian_phone, sd.learning_goal,
        qd.country as qari_country, qd.city as qari_city, qd.address as qari_address, 
        qd.phone_no as qari_phone, qd.dob as qari_dob, qd.bio as qari_bio, qd.certificate_path
      FROM users u 
      LEFT JOIN student_details sd ON u.user_id = sd.user_id 
      LEFT JOIN qari_details qd ON u.user_id = qd.user_id 
      WHERE LOWER(u.email) = LOWER($1)
    `;
    const result = await pool.query(query, [email]);
    return result.rows[0];
  }

  static async findUserById(id) {
    const query = `
      SELECT 
        u.*, 
        sd.country as student_country, sd.city as student_city, sd.address as student_address, 
        sd.phone_no as student_phone, sd.dob as student_dob, sd.guardian_name, sd.guardian_phone, sd.learning_goal,
        qd.country as qari_country, qd.city as qari_city, qd.address as qari_address, 
        qd.phone_no as qari_phone, qd.dob as qari_dob, qd.bio as qari_bio, qd.certificate_path
      FROM users u 
      LEFT JOIN student_details sd ON u.user_id = sd.user_id 
      LEFT JOIN qari_details qd ON u.user_id = qd.user_id 
      WHERE u.user_id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async updateUser(id, updateData) {
    const { name, email, userType } = updateData;
    const role = userType.toLowerCase();

    const query = `
      UPDATE users 
      SET full_name = $1, email = $2, role = $3
      WHERE user_id = $4
      RETURNING user_id, full_name, email, role, created_at
    `;
    const values = [name, email, role, id];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  // Update student details
  static async updateStudentDetails(userId, studentData) {
    const { country, city, address, phoneNumber, dateOfBirth, guardianName, guardianPhone, learningGoal } = studentData;

    const query = `
      INSERT INTO student_details (user_id, country, city, address, phone_no, dob, guardian_name, guardian_phone, learning_goal, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        country = $2, city = $3, address = $4, phone_no = $5, dob = $6, 
        guardian_name = $7, guardian_phone = $8, learning_goal = $9, updated_at = NOW()
      RETURNING *
    `;
    const values = [
      userId, country, city, address, phoneNumber, dateOfBirth, 
      guardianName, guardianPhone, learningGoal
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  // Update Qari details
  static async updateQariDetails(userId, qariData) {
    const { country, city, address, phoneNumber, dateOfBirth, bio, certificatePath } = qariData;

    const query = `
      UPDATE qari_details 
      SET country = $1, city = $2, address = $3, phone_no = $4, 
          dob = $5, bio = $6, certificate_path = $7, updated_at = NOW()
      WHERE user_id = $8
      RETURNING *
    `;
    const values = [country, city, address, phoneNumber, dateOfBirth, bio, certificatePath, userId];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async deleteUser(id) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Delete from details tables first if exists
      await client.query('DELETE FROM student_details WHERE user_id = $1', [id]);
      await client.query('DELETE FROM qari_details WHERE user_id = $1', [id]);
      
      // Then delete from users
      const result = await client.query('DELETE FROM users WHERE user_id = $1 RETURNING user_id', [id]);
      
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Update password by email (used for password reset)
  static async updatePasswordByEmail(email, newPassword) {
    const hashed = await bcrypt.hash(newPassword, 12);
    const query = `UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING user_id`;
    const result = await pool.query(query, [hashed, email]);
    return result.rowCount > 0;
  }

  static async updatePasswordById(userId, newPassword) {
    const hashed = await bcrypt.hash(newPassword, 12);
    const query = `UPDATE users SET password_hash = $1 WHERE user_id = $2 RETURNING user_id`;
    const result = await pool.query(query, [hashed, userId]);
    return result.rowCount > 0;
  }

  static async verifyPassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  static async getUsersByType(userType) {
    const role = userType.toLowerCase();
    const query = `
      SELECT 
        u.user_id, u.full_name, u.email, u.role, u.created_at,
        sd.country, sd.city, sd.phone_no, sd.guardian_name, sd.guardian_phone,
        qd.country as qari_country, qd.city as qari_city, qd.phone_no as qari_phone
      FROM users u 
      LEFT JOIN student_details sd ON u.user_id = sd.user_id 
      LEFT JOIN qari_details qd ON u.user_id = qd.user_id 
      WHERE u.role = $1 
      ORDER BY u.created_at DESC
    `;
    const result = await pool.query(query, [role]);
    return result.rows;
  }

  static async getAllUsers() {
    const query = `
      SELECT 
        u.user_id, u.full_name, u.email, u.role, u.created_at,
        sd.country, sd.city, sd.phone_no, sd.guardian_name, sd.guardian_phone,
        qd.country as qari_country, qd.city as qari_city, qd.phone_no as qari_phone
      FROM users u 
      LEFT JOIN student_details sd ON u.user_id = sd.user_id 
      LEFT JOIN qari_details qd ON u.user_id = qd.user_id 
      ORDER BY u.created_at DESC
    `;
    const result = await pool.query(query);
    return result.rows;
  }
  static async getStudentDetails(userId) {
    const result = await pool.query(
      `SELECT country, city, address, phone_no, dob, guardian_name, guardian_phone, learning_goal
       FROM student_details WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0] || null;
  }
  
  static async getQariDetails(userId) {
    const result = await pool.query(
      `SELECT country, city, address, phone_no, dob, bio, certificate_path
       FROM qari_details WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0] || null;
  }
  
  // Get student by user ID
  static async getStudentByUserId(userId) {
    const query = `
      SELECT sd.*, u.full_name, u.email, u.role
      FROM student_details sd
      JOIN users u ON sd.user_id = u.user_id
      WHERE sd.user_id = $1
    `;
    const result = await pool.query(query, [userId]);
    return result.rows[0];
  }

  // Get all students with details
  static async getAllStudentsWithDetails() {
    const query = `
      SELECT 
        u.user_id, u.full_name, u.email, u.created_at,
        sd.*
      FROM users u
      JOIN student_details sd ON u.user_id = sd.user_id
      WHERE u.role = 'student'
      ORDER BY u.created_at DESC
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  // Get all qaris with details
  static async getAllQarisWithDetails() {
    const query = `
      SELECT 
        u.user_id, u.full_name, u.email, u.created_at,
        qd.*
      FROM users u
      JOIN qari_details qd ON u.user_id = qd.user_id
      WHERE u.role = 'qari'
      ORDER BY u.created_at DESC
    `;
    const result = await pool.query(query);
    return result.rows;
  }
static async findOrCreateOAuthUser({ email, name, role = 'student' }) {
    // Try to find existing user by email
    const existing = await this.findUserByEmail(email)
    if (existing) return existing

    // Create minimal user with random password to satisfy NOT NULL
    const randomPass = Math.random().toString(36).slice(2) + Date.now().toString(36)
    const hashedPassword = await bcrypt.hash(randomPass, 12)

    const client = await pool.connect()
    try {
      const insert = `
        INSERT INTO users (full_name, email, password_hash, role, created_at)
        VALUES ($1, $2, $3, $4, NOW())
        RETURNING user_id, full_name, email, role, created_at
      `
      const values = [name || email.split('@')[0], email, hashedPassword, role.toLowerCase()]
      const result = await client.query(insert, values)
      return result.rows[0]
    } finally {
      client.release()
    }
  }
}

export default UserModel;