---
title: "适配Ubuntu24.04 LTS的gazebo物理3D仿真平台入门调用方法"
description: "背景：Gazebo为一款高性能3D物理仿真平台，其可为机器人开发提供逼近现实的虚拟环境。但目前经过大 ..."
publishedAt: "2026-04-29T20:41:41"
updatedAt: "2026-04-29T20:50:19"
category: "engineering"
featuredImage: "/media/2026/04/fengmian.png"
wordpressId: 72
oldUrl: "https://www.sparkle1128.top/index.php/2026/04/29/can-curiosity-may-end-shameless-explained/"
draft: false
---
**背景**：Gazebo为一款高性能3D物理仿真平台，其可为机器人开发提供逼近现实的虚拟环境。但目前经过大幅更新改造后网上现存的大多数Gazebo调用教程均已失效，使大多数人被迫半途而废选择降级下回Ubuntu22.04版本，如图：（PS:本人用的是VMware虚拟机上的Linux系统）

![](/media/2026/04/pinlun1.png)

![](/media/2026/04/pinlun.png)

## 一、笔者遇到的一些典型问题

![](/media/2026/04/2-1.png)

1.  **传统的gazebo\_ros包在新的版本中已经不在适用。原因**：ROS2 Jazzy默认使用的是Gazebo Harmonic而非传统的Gazebo 8/11，环境文件路径已并非原版

![](/media/2026/04/wenti2.jpg)

2\. **在修改完bashrc文件环境变量后每次打开终端都会报错**。**原因：**~/.bashrc文件被写坏了，其中可能有无效错误语法与命令

![](/media/2026/04/1-5.png)

3\. **即便打开gazebo后页面出现频繁屏闪，显示出现问题。原因：**渲染引擎冲突

下文会针对这三个问题分别给出具体方案！

## · ”Package ‘gazebo\_ros’ not found“

1.  安装新版Gazebo与ROS 2集成包

Ctrl+Alt+T启动终端

```
sudo apt update
sudo apt install ros-jazzy-ros-gz
sudo apt install ros-jazzy-ros-gz-sim
sudo apt install ros-jazzy-ros-gz-bridge
```

2\. 对于Harmonic版本额外添加环境变量并检查

```
echo "source /usr/share/gazebo/setup.sh" >> ~/.bashrc #添加环境变量
echo "export GZ_SIM_RESOURCE_PATH=/usr/share/gazebo-11/models:/usr/share/gazebo-11/worlds" >> ~/.bashrc
source ~/.bashrc
echo "source /opt/ros/jazzy/setup.bash" >> ~/.bashrc #检查环境变量
source ~/.bashrc
```

3\. 检查环境并启动仿真

```
printenv | grep ROS
printenv | grep GZ
ros2 launch ros_gz_sim gz_sim.launch.py gz_args:=empty.sdf #启动
```

如配置正确，终端应当输出以下结果：

```
ROS_VERSION=2
ROS_PYTHON_VERSION=3
ROS_AUTOMATIC_DISCOVERY_RANGE=SUBNET
ROS_DISTRO=jazzy

GZ_SIM_RESOURCE_PATH=/usr/share/gazebo/models:/usr/share/gazebo/worlds:/opt/ros/jazzy/share
GZ_CONFIG_PATH=/opt/ros/jazzy/opt/gz_sim_vendor/share/gz:/opt/ros/jazzy/opt/sdformat_vendor/share/gz:/opt/ros/jazzy/opt/gz_gui_vendor/share/gz:/opt/ros/jazzy/opt/gz_transport_vendor/share/gz:/opt/ros/jazzy/opt/gz_rendering_vendor/share/gz:/opt/ros/jazzy/opt/gz_plugin_vendor/share/gz:/opt/ros/jazzy/opt/gz_fuel_tools_vendor/share/gz:/opt/ros/jazzy/opt/gz_msgs_vendor/share/gz:/opt/ros/jazzy/opt/gz_common_vendor/share/gz
GZ_SIM_RENDER_ENGINE=ogre2
```

（\*）如出现报错：**No such file or directory: source /usr/share/gazebo/setup.sh**

修改文件路径：

1\. 找到正确的路径

```
find /usr/share -name "setup.sh" | grep gazebo
```

2.修改 .bashrc并重新加载环境

```
echo "source /usr/share/gazebo-$(gz --version | awk '{print $2}' | cut -d. -f1)/setup.sh" >> ~/.bashrc
source ~/.bashrc
```

## · ~/.bashrc文件被写坏

1.  快速重置 .bashrc

```
cp /etc/skel/.bashrc ~/.bashrc #复制系统默认模板
```

2\. 打开 .bashrc编辑正确配置

```
nano ~/.bashrc
```

出现该文件

![](/media/2026/04/nano.png)

在文件最末尾，把里面所有关于 gazebo/setup.sh 的行**全部删除**，只保留以下几行配置

```
source /opt/ros/jazzy/setup.bash
export GZ_SIM_RESOURCE_PATH=/usr/share/gazebo/models:/usr/share/gazebo/worlds
```

3\. 保存退出

Ctrl+O保存👉回车👉Ctrl+X推出

4.重新加载环境

```
source ~/.bashrc
```

验证是否能打开了

```
ros2 launch ros_gz_sim gz_sim.launch.py gz_args:=empty.sdf
```

## · Gazebo Sim窗口频繁屏闪

此为ROS 2 Jazzy + Gazebo Harmonic在Ubuntu 24.04的常见**兼容性问题**

因VMware虚拟机难以修改其显卡驱动（我未找到），笔者采用的方法是直接禁用硬件加速，和上个问题的解决方法同样暴力有效

1.  配置前先检查此方案是否有效

```
# 临时设置环境变量，禁用硬件加速
export GZ_SIM_RENDER_ENGINE=ogre2
export LIBGL_ALWAYS_SOFTWARE=1

# 再启动 Gazebo
ros2 launch ros_gz_sim gz_sim.launch.py gz_args:=empty.sdf
```

2.若有效解决，把如下代码修改进 .bashrc文件使永久有效（不需要nano命令打开文件即可）

```
echo "export GZ_SIM_RENDER_ENGINE=ogre2" >> ~/.bashrc
echo "export LIBGL_ALWAYS_SOFTWARE=1" >> ~/.bashrc
source ~/.bashrc
```

这样配置好显示就正常了，但加载运行速度肯定会比正常慢一些

![](/media/2026/04/chenggong.png)

**根本方法**其实是修复显卡驱动，应选择NVIDIA/AMD官方的闭源驱动（别在VMware上这么搞，想尝试的话记得备份电脑再试），但这不在本文的讨论范围之内

便捷启用Gazebo Simulation的代码

```
gz sim
```

文章到现在就结束了，希望我的文章能帮助到你解决问题，感谢！
