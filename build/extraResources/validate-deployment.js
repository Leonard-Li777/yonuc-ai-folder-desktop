/**
 * 部署验证脚本
 * 用于验证 extraResources 目录的完整性
 * 特别针对官方 llama.cpp 发布包的验证
 */

const fs = require('fs');
const path = require('path');

function validateDeployment() {
  console.log('🔍 验证部署完整性...');
  
  const baseDir = __dirname;
  const errors = [];
  const warnings = [];
  
  // 检查基础目录
  const requiredDirs = ['llama', 'model', 'fileDimension', 'configs'];
  requiredDirs.forEach(dir => {
    const dirPath = path.join(baseDir, dir);
    if (!fs.existsSync(dirPath)) {
      errors.push(`缺少目录: ${dir}`);
    }
  });
  
  // 检查配置文件
  const requiredConfigs = [
    'configs/binaries.json',
    'configs/server-defaults.json'
  ];
  
  requiredConfigs.forEach(config => {
    const configPath = path.join(baseDir, config);
    if (!fs.existsSync(configPath)) {
      errors.push(`缺少配置文件: ${config}`);
    } else {
      // 验证配置文件内容
      try {
        const content = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config === 'configs/binaries.json' && content.llamaCppVersion) {
          console.log(`✅ llama.cpp 版本: ${content.llamaCppVersion}`);
        }
      } catch (e) {
        warnings.push(`配置文件格式错误: ${config}`);
      }
    }
  });
  
  // 检查 llama.cpp 二进制文件目录
  const llamaDir = path.join(baseDir, 'llama');
  if (fs.existsSync(llamaDir)) {
    const binaryDirs = fs.readdirSync(llamaDir);
    if (binaryDirs.length === 0) {
      warnings.push('llama目录为空，没有二进制文件');
    } else {
      console.log(`✅ 找到 ${binaryDirs.length} 个二进制文件目录`);
      
      // 检查每个二进制目录
      binaryDirs.forEach(dir => {
        const fullPath = path.join(llamaDir, dir);
        if (fs.lstatSync(fullPath).isDirectory()) {
          const files = fs.readdirSync(fullPath);
          
          // 检查是否只有 README（表示下载失败）
          if (files.length <= 1 && files.includes('README.md')) {
            warnings.push(`${dir} 仅包含 README，可能缺少二进制文件`);
          } else {
            // 检查是否包含预期的可执行文件
            const hasExecutable = files.some(file => 
              file.includes('llama-server') || 
              file.includes('llama-cli') ||
              file.endsWith('.exe')
            );
            
            if (hasExecutable) {
              console.log(`  ✅ ${dir}: 包含可执行文件`);
            } else {
              warnings.push(`${dir}: 未找到预期的可执行文件`);
            }
          }
        }
      });
    }
  }
  
  // 输出结果
  if (errors.length > 0) {
    console.log('❌ 验证失败:');
    errors.forEach(error => console.log(`  - ${error}`));
  }
  
  if (warnings.length > 0) {
    console.log('⚠️ 警告:');
    warnings.forEach(warning => console.log(`  - ${warning}`));
  }
  
  if (errors.length === 0) {
    console.log('✅ 部署验证通过');
    if (warnings.length === 0) {
      console.log('🎉 所有检查都通过，可以进行打包');
    }
  }
  
  return errors.length === 0;
}

if (require.main === module) {
  validateDeployment();
}

module.exports = { validateDeployment };
