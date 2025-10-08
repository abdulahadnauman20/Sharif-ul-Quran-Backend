import UserModel from '../models/UserModel.js';
import { generateToken } from '../utils/generateToken.js';
import { body, validationResult } from 'express-validator';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import pool from '../config/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/certificates';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'certificate-' + uniqueSuffix + path.extname(file.originalname));
  }
});


const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf' || 
      file.mimetype === 'image/jpeg' || 
      file.mimetype === 'image/jpg' || 
      file.mimetype === 'image/png') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF, JPG, and PNG files are allowed'), false);
  }
};

export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Generate 6-digit OTP
const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

// sendOtpEmail using Gmail service (nodemailer must be installed)
const sendOtpEmail = async (toEmail, code) => {
  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SMTP_USER || process.env.EMAIL_USER,
        pass: process.env.SMTP_PASS || process.env.EMAIL_PASS
      }
    });

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.EMAIL_USER || 'teamtestsphere@gmail.com',
      to: toEmail,
      subject: 'Password Reset OTP',
      text: `Your OTP for password reset is: ${code}. This code expires in 10 minutes.`
    });

    console.log('OTP email sent:', info?.messageId || info);
  } catch (err) {
    console.error('Failed to send OTP email:', err);
    // fallback to console
    console.log(`[OTP fallback] To: ${toEmail} Code: ${code}`);
  }
};

// Forgot password - send OTP (DB-backed)
const forgotPassword = async (req, res) => {
  const { email } = req.body;
  let client;

  try {
    client = await pool.connect();

    // Check if user exists
    const userResult = await client.query('SELECT otp_attempts, otp_last_attempt FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Email does not exist in our database.' });
    }

    const user = userResult.rows[0];
    const now = Date.now();
    const lastAttempt = user.otp_last_attempt ? new Date(user.otp_last_attempt).getTime() : 0;
    const tenMinutes = 10 * 60 * 1000;

    if (now - lastAttempt < tenMinutes) {
      if (user.otp_attempts >= 3) {
        return res.status(429).json({ success: false, message: 'Maximum OTP attempts reached. Please try again after 10 minutes.' });
      }
      await client.query('UPDATE users SET otp_attempts = otp_attempts + 1 WHERE email = $1', [email]);
    } else {
      await client.query('UPDATE users SET otp_attempts = 1 WHERE email = $1', [email]);
    }

    const otp = generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    await client.query('UPDATE users SET otp = $1, otp_expiry = $2, otp_last_attempt = $3 WHERE email = $4', [otp, otpExpiry, new Date(), email]);

    // send email
    await sendOtpEmail(email, otp);

    const devReturn = process.env.NODE_ENV === 'development' || process.env.DEV_RETURN_OTP === 'true';
    const responseBody = { success: true, message: 'OTP sent to your email.', from: process.env.SMTP_FROM || process.env.EMAIL_USER || 'teamtestsphere@gmail.com' };
    if (devReturn) responseBody.devCode = otp;

    res.status(200).json(responseBody);
  } catch (err) {
    console.error('Error in forgotPassword:', err);
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again later.' });
  } finally {
    if (client) client.release();
  }
};

// Verify OTP
// Verify OTP
import crypto from "crypto";

// Verify OTP
// verifyOtp.js
const verifyOtp = async (req, res) => {
  const { email, code } = req.body;
  const client = await pool.connect();
  try {
    const userResult = await client.query(
      "SELECT otp, otp_expiry FROM users WHERE email = $1",
      [email]
    );
    if (userResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: "No OTP found for this email" });
    }

    const row = userResult.rows[0];
    if (!row.otp || row.otp.trim() !== code.trim()) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    if (Date.now() > new Date(row.otp_expiry).getTime()) {
      return res.status(400).json({ success: false, message: "OTP expired" });
    }

    // ✅ Instead of issuing resetToken, just confirm
    return res.json({ success: true, message: "OTP verified, you can reset your password now" });
  } finally {
    client.release();
  }
};

// resetPassword.js
const resetPassword = async (req, res) => {
  const { email, newPassword, code } = req.body; // include OTP here
  const client = await pool.connect();
  try {
    const userResult = await client.query(
      "SELECT otp, otp_expiry FROM users WHERE email = $1",
      [email]
    );
    if (userResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: "User not found" });
    }

    const row = userResult.rows[0];
    if (!row.otp || row.otp.trim() !== code.trim()) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    if (Date.now() > new Date(row.otp_expiry).getTime()) {
      return res.status(400).json({ success: false, message: "OTP expired" });
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await client.query(
      "UPDATE users SET password_hash = $1, otp = NULL, otp_expiry = NULL, otp_attempts = 0, otp_last_attempt = NULL WHERE email = $2",
      [hashed, email]
    );

    res.json({ success: true, message: "Password reset successful" });
  } finally {
    client.release();
  }
};

// Resend OTP (throttle)
const resendOtp = async (req, res) => {
  const { email } = req.body;
  let client;

  try {
    client = await pool.connect();
    const userResult = await client.query('SELECT otp_last_attempt FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) return res.status(404).json({ success: false, message: 'Email not found' });

    const lastAttempt = userResult.rows[0].otp_last_attempt ? new Date(userResult.rows[0].otp_last_attempt).getTime() : 0;
    const now = Date.now();
    if (now - lastAttempt < 30 * 1000) return res.status(429).json({ success: false, message: 'Please wait before resending code' });

    const otp = generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await client.query('UPDATE users SET otp = $1, otp_expiry = $2, otp_last_attempt = $3 WHERE email = $4', [otp, otpExpiry, new Date(), email]);

    await sendOtpEmail(email, otp);
    res.json({ success: true, message: 'Verification code resent' });
  } catch (err) {
    console.error('Error in resendOtp:', err);
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again later.' });
  } finally {
    if (client) client.release();
  }
};


// Validation rules
const registerValidation = [
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('userType').isIn(['Student', 'Qari']).withMessage('User type must be either Student or Qari')
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').notEmpty().withMessage('Password is required')
];

const register = async (req, res) => {
  try {
    // Handle file upload errors from multer
    if (req.fileValidationError) {
      return res.status(400).json({
        success: false,
        message: req.fileValidationError
      });
    }

    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Clean up uploaded file if validation fails
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, email, password, userType } = req.body;

    // Check if user already exists
    const existingUser = await UserModel.findUserByEmail(email);
    if (existingUser) {
      // Clean up uploaded file if user exists
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Prepare user data
    const userData = {
      name,
      email,
      password,
      userType
    };

    // Add Student details if user is Student
    if (userType === 'Student') {
      const { country, city, address, phoneNumber, dateOfBirth, guardianName, guardianPhone, learningGoal } = req.body;

      userData.studentDetails = {
        country,
        city,
        address: address || '',
        phoneNumber,
        dateOfBirth: dateOfBirth || '',
        guardianName: guardianName || '',
        guardianPhone: guardianPhone || '',
        learningGoal: learningGoal || ''
      };

      // Validate required Student fields
      if (!country || !city || !phoneNumber || !guardianName || !guardianPhone) {
        return res.status(400).json({
          success: false,
          message: 'Country, city, phone number, guardian name, and guardian phone are required for Student registration'
        });
      }
    }

    // Add Qari details if user is Qari
    if (userType === 'Qari') {
      const { country, city, address, phoneNumber, dateOfBirth, bio } = req.body;

      userData.qariDetails = {
        country,
        city,
        address: address || '',
        phoneNumber,
        dateOfBirth: dateOfBirth || '',
        bio: bio || '',
        certificateFile: req.file ? req.file.path : null
      };

      // Validate required Qari fields
      if (!country || !city || !phoneNumber || !req.file) {
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({
          success: false,
          message: 'Country, city, phone number, and certificate are required for Qari registration'
        });
      }
    }

    // Create new user
    const newUser = await UserModel.createUser(userData);
    
    // Generate JWT token
    const token = generateToken({ 
      userId: newUser.user_id, 
      email: newUser.email,
      role: newUser.role
    });

    // Prepare response data
    const responseData = {
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: newUser.user_id,
          name: newUser.full_name,
          email: newUser.email,
          role: newUser.role,
          created_at: newUser.created_at
        },
        token
      }
    };

    // Add details to response if applicable
    if (userType === 'Student' && newUser.studentDetails) {
      responseData.data.studentDetails = newUser.studentDetails;
    }
    if (userType === 'Qari' && newUser.qariDetails) {
      responseData.data.qariDetails = newUser.qariDetails;
    }

    res.status(201).json(responseData);
  } catch (error) {
    console.error('Registration error:', error);
    
    // Clean up uploaded file if there was an error
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting uploaded file:', unlinkError);
      }
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error during registration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Step 1: Find user
    const user = await UserModel.findUserByEmail(email);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Step 2: Verify password
    const isPasswordValid = await UserModel.verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Step 3: Fetch student/qari details if applicable
    let studentDetails = null;
    let qariDetails = null;

    if (user.role === 'student') {
      studentDetails = await UserModel.getStudentDetails(user.user_id);
    }
    if (user.role === 'qari') {
      qariDetails = await UserModel.getQariDetails(user.user_id);
    }

    // Step 4: Generate JWT
    const token = generateToken({
      userId: user.user_id,
      email: user.email,
      role: user.role
    });

    // Step 5: Send response
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.user_id,
          name: user.full_name,
          email: user.email,
          role: user.role,
          created_at: user.created_at,
          studentDetails,
          qariDetails
        },
        token
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during login'
    });
  }
};


const getProfile = async (req, res) => {
  try {
    const user = await UserModel.findUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prepare user response data
    const userResponse = {
      id: user.user_id,
      name: user.full_name,
      email: user.email,
      role: user.role,
      created_at: user.created_at
    };

    // Add Student details if user is a Student
    if (user.role === 'student' && user.student_country) {
      userResponse.studentDetails = {
        country: user.student_country,
        city: user.student_city,
        address: user.student_address,
        phoneNumber: user.student_phone,
        dateOfBirth: user.student_dob,
        guardianName: user.guardian_name,
        guardianPhone: user.guardian_phone,
        learningGoal: user.learning_goal
      };
    }

    // Add Qari details if user is a Qari
    if (user.role === 'qari' && user.qari_country) {
      userResponse.qariDetails = {
        country: user.qari_country,
        city: user.qari_city,
        address: user.qari_address,
        phoneNumber: user.qari_phone,
        dateOfBirth: user.qari_dob,
        bio: user.qari_bio,
        certificatePath: user.certificate_path
      };
    }

    res.json({
      success: true,
      data: { user: userResponse }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { name, userType } = req.body;
    const userId = req.user.userId;

    // Disallow email change via this endpoint
    const updatedUser = await UserModel.updateUser(userId, { name, email: req.user.email, userType });
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { user: updatedUser }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Change password (authenticated)
const changePassword = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' })
    }

    // Load user hashed password
    const user = await UserModel.findUserById(userId)
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }

    const isValid = await UserModel.verifyPassword(currentPassword || '', user.password_hash)
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' })
    }

    const ok = await UserModel.updatePasswordById(userId, newPassword)
    if (!ok) {
      return res.status(500).json({ success: false, message: 'Failed to update password' })
    }

    res.json({ success: true, message: 'Password updated successfully' })
  } catch (error) {
    console.error('Change password error:', error)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

const updateStudentDetails = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      country,
      city,
      address,
      phoneNumber,
      dateOfBirth,
      guardianName,
      guardianPhone,
      learningGoal
    } = req.body;

    // Validate required fields
    if (!country || !city || !phoneNumber || !guardianName || !guardianPhone) {
      return res.status(400).json({
        success: false,
        message: 'Country, city, phone number, guardian name, and guardian phone are required'
      });
    }

    const studentData = {
      country,
      city,
      address: address || '',
      phoneNumber,
      dateOfBirth: dateOfBirth || '',
      guardianName,
      guardianPhone,
      learningGoal: learningGoal || ''
    };

    const updatedStudent = await UserModel.updateStudentDetails(userId, studentData);

    res.json({
      success: true,
      message: 'Student details updated successfully',
      data: {
        studentDetails: updatedStudent
      }
    });
  } catch (error) {
    console.error('Update student details error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const getUsersByType = async (req, res) => {
  try {
    const { userType } = req.params;
    
    if (!['Student', 'Qari'].includes(userType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user type. Must be Student or Qari'
      });
    }

    const users = await UserModel.getUsersByType(userType);
    
    res.json({
      success: true,
      data: { users }
    });
  } catch (error) {
    console.error('Get users by type error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const users = await UserModel.getAllUsers();
    
    res.json({
      success: true,
      data: { users }
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// New function to handle certificate file serving
const getCertificate = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await UserModel.findUserById(userId);
    if (!user || user.role !== 'qari') {
      return res.status(404).json({
        success: false,
        message: 'Qari user not found'
      });
    }

    if (!user.certificate_path) {
      return res.status(404).json({
        success: false,
        message: 'Certificate not found'
      });
    }

    // Check if file exists
    if (!fs.existsSync(user.certificate_path)) {
      return res.status(404).json({
        success: false,
        message: 'Certificate file not found'
      });
    }

    // Send the file
    res.sendFile(path.resolve(user.certificate_path));
  } catch (error) {
    console.error('Get certificate error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// OAuth handlers: Google & Facebook
const getBaseUrl = (req) => {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol);
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}`;
};

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI; // Optional explicit override

// GOOGLE OAUTH
const googleAuthStart = async (req, res) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(500).json({ success: false, message: 'Google OAuth is not configured (missing client id/secret)' })
    }
    const redirectUri = GOOGLE_REDIRECT_URI || `${getBaseUrl(req)}/api/auth/google/callback`;
    const scope = ['openid', 'email', 'profile'].join(' ');
    const state = encodeURIComponent(req.query.state || '');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope,
      access_type: 'offline',
      prompt: 'consent',
      state
    });
    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return res.redirect(url);
  } catch (e) {
    console.error('googleAuthStart error:', e);
    return res.status(500).json({ success: false, message: 'Failed to start Google auth' });
  }
};

const googleAuthCallback = async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) return res.status(400).json({ success: false, message: 'Missing authorization code' })

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = GOOGLE_REDIRECT_URI || `${getBaseUrl(req)}/api/auth/google/callback`;

    const tokenParams = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString()
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text().catch(() => '');
      console.error('Google token error:', errText);
      return res.status(400).json({ success: false, message: 'Failed to exchange code for token' });
    }

    const tokenJson = await tokenRes.json();
    const accessToken = tokenJson.access_token;
    if (!accessToken) return res.status(400).json({ success: false, message: 'No access token received' })

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!profileRes.ok) {
      const errText = await profileRes.text().catch(() => '');
      console.error('Google profile error:', errText);
      return res.status(400).json({ success: false, message: 'Failed to fetch Google user profile' });
    }

    const profile = await profileRes.json();
    const email = profile.email;
    const name = profile.name || profile.given_name || profile.email?.split('@')[0] || 'Google User';

    if (!email) {
      return res.status(400).json({ success: false, message: 'Google account has no email available' });
    }

    const dbUser = await UserModel.findOrCreateOAuthUser({ email, name, role: 'student' });

    const token = generateToken({ userId: dbUser.user_id, email: dbUser.email, role: dbUser.role });

    const finalUrl = `${FRONTEND_URL}/?token=${encodeURIComponent(token)}#/portal`;
    return res.redirect(finalUrl);
  } catch (e) {
    console.error('googleAuthCallback error:', e);
    return res.status(500).json({ success: false, message: 'Failed to handle Google auth callback' });
  }
};

// FACEBOOK OAUTH
const FACEBOOK_REDIRECT_URI = process.env.FACEBOOK_REDIRECT_URI || process.env.FACEBOOK_CALLBACK_URL; // Optional explicit override
const facebookAuthStart = async (req, res) => {
  try {
    const appId = process.env.FACEBOOK_APP_ID || process.env.FACEBOOK_CLIENT_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET || process.env.FACEBOOK_CLIENT_SECRET;
    if (!appId || !appSecret) {
      return res.status(500).json({ success: false, message: 'Facebook OAuth is not configured (missing app id/secret)' })
    }
    const redirectUri = FACEBOOK_REDIRECT_URI || `${getBaseUrl(req)}/api/auth/facebook/callback`;
    const state = encodeURIComponent(req.query.state || '');

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'public_profile,email',
      state
    });
    const url = `https://www.facebook.com/v17.0/dialog/oauth?${params.toString()}`;
    return res.redirect(url);
  } catch (e) {
    console.error('facebookAuthStart error:', e);
    return res.status(500).json({ success: false, message: 'Failed to start Facebook auth' });
  }
};

const facebookAuthCallback = async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) return res.status(400).json({ success: false, message: 'Missing authorization code' })

    const appId = process.env.FACEBOOK_APP_ID || process.env.FACEBOOK_CLIENT_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET || process.env.FACEBOOK_CLIENT_SECRET;
    const redirectUri = FACEBOOK_REDIRECT_URI || `${getBaseUrl(req)}/api/auth/facebook/callback`;

    const tokenParams = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code
    });

    const tokenRes = await fetch(`https://graph.facebook.com/v17.0/oauth/access_token?${tokenParams.toString()}`, { method: 'GET' });
    if (!tokenRes.ok) {
      const errText = await tokenRes.text().catch(() => '');
      console.error('Facebook token error:', errText);
      return res.status(400).json({ success: false, message: 'Failed to exchange code for token' });
    }

    const tokenJson = await tokenRes.json();
    const accessToken = tokenJson.access_token;
    if (!accessToken) return res.status(400).json({ success: false, message: 'No access token received' })

    const profileRes = await fetch(`https://graph.facebook.com/me?fields=id,name,email&access_token=${encodeURIComponent(accessToken)}`);

    if (!profileRes.ok) {
      const errText = await profileRes.text().catch(() => '');
      console.error('Facebook profile error:', errText);
      return res.status(400).json({ success: false, message: 'Failed to fetch Facebook user profile' });
    }

    const profile = await profileRes.json();
    let email = profile.email;
    const name = profile.name || 'Facebook User';

    // Some Facebook accounts may not return email without extra permissions
    if (!email) {
      email = `${profile.id}@facebook.local`;
    }

    const dbUser = await UserModel.findOrCreateOAuthUser({ email, name, role: 'student' });

    const token = generateToken({ userId: dbUser.user_id, email: dbUser.email, role: dbUser.role });

    const finalUrl = `${FRONTEND_URL}/?token=${encodeURIComponent(token)}#/portal`;
    return res.redirect(finalUrl);
  } catch (e) {
    console.error('facebookAuthCallback error:', e);
    return res.status(500).json({ success: false, message: 'Failed to handle Facebook auth callback' });
  }
};

export {
  register,
  login,
  getProfile,
  updateProfile,
  updateStudentDetails,
  getUsersByType,
  getAllUsers,
  getCertificate,
  registerValidation,
  loginValidation,
  googleAuthStart,
  googleAuthCallback,
  facebookAuthStart,
  facebookAuthCallback
};

// Additional exports for OTP/password reset
export {
  forgotPassword,
  verifyOtp,
  resendOtp,
  resetPassword,
  changePassword
};