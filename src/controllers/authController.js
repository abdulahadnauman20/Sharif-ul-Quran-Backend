import UserModel from '../models/UserModel.js';
import { generateToken } from '../utils/generateToken.js';
import { body, validationResult } from 'express-validator';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

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
    const { name, email, userType } = req.body;
    const userId = req.user.userId;

    const updatedUser = await UserModel.updateUser(userId, { name, email, userType });
    
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
  loginValidation
};