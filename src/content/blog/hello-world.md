---
title: "Windows11上部署Ubuntu24.04.4 LTS版本ROS2 Jazzy的方法(保姆级)"
description: "背景： 本人欲完成大一SRTP任务运输车自动导航系统，以多路工业相机，低精高频GPS，IMU三个no ..."
publishedAt: "2026-04-18T21:55:53"
updatedAt: "2026-04-22T18:02:41"
category: "engineering"
featuredImage: "/media/2026/04/1-3.jpg"
wordpressId: 1
oldUrl: "https://www.sparkle1128.top/index.php/2026/04/18/hello-world/"
draft: false
---
背景：

本人欲完成大一SRTP任务运输车自动导航系统，以多路工业相机，低精高频GPS，IMU三个nodes基于ROS2初步构建前端系统用以collect & process特征信息与位姿解算。后期欲以算法并接入LLM滤去噪音。但本人目前基础为零，先从最基础的开始。

该方案优势是通过建立单个或多个虚拟机来便捷地分区块进行工作。尤其注意Ubuntu 24.04.4 LTS版本官方唯一指定只有Jazzy版本的ROS2能够完全适配，千万不能下成humble等诸多其他版本。

**方法步骤**：

**1.下载VMware**

[https://www.vmware.com/products/desktop-hypervisor/workstation-and-fusion](https://www.vmware.com/products/desktop-hypervisor/workstation-and-fusion)

在此网站下载VMware，若没有账号，在下面这个软件注册Broadcom账号

[profile.broadcom.com/web/registration](http://profile.broadcom.com/web/registration)

**2.下载Ubuntu**

[https://ubuntu.com/download/desktop#newsletter-signup](https://ubuntu.com/download/desktop#newsletter-signup)

![](/media/2026/04/1-3.jpg)

注册后下载Ubuntu 24.04.4 LTS到一个你常用的位置。

**注意！！！**千万不能解压或者手贱点开你下好的以.iso结尾的文件。它会自动接入你的光盘映像器(F:)。如果你插入了，直接右键F盘弹出后再下载即可。

**3\. 于VMware中创建虚拟机**

![](/media/2026/04/1.png)

点击Create a New Virtual Machine

Typical(Recommended)

👉I will install the operating system later

👉Linux

👉Machine Name可以设成自己喜欢的

👉Maximum disk size初学者建议20GB即可 专业人士40-50GB均可

👉Finish

**4.编辑虚拟机配置**

![](/media/2026/04/1-1.png)

点击Edit virtual machine settings

先根据你电脑的配置分配其内存以及处理器数量（也可以直接照搬给予的系统推荐）

然后点击CD/DVD（SATA)浏览你于第二步下好的Ubuntu文件

👉确定

**5.于虚拟机中下载Ubuntu**

启动虚拟机

你可能会看到如下界面

![](/media/2026/04/1-2.png)

此下载过程与你在Windows操作系统上基本一致(.exe文件），可能会要求设置你的用户名，密码，时区（点在上海附近即可）等等此处不多进行详解。即便过程中断，也可以按照你在Windows系统里正常操作的方法继续或重新开始。此处下载时间较长，耐心等待20-40分钟。

下完后会要求你重启。**重启时记得按回车键以继续**

（如界面太小，可以右键点击Display Settings来修改分辨率比例等）

**6\. 部署ROS2 Jazzy**

此处我选择从清华软件源下载此版本ROS2 这种方法的优势是国内用户无需费劲找当前us raw.githubusercontent.com网络地址段即可轻松下载

先打开VMware的复制粘贴功能：

1.关闭正在运行的虚拟机

2.左上角 VM–settings–options–Guest Isolation 勾选上Enable copy and paste

3.查看左侧新建的虚拟机列表，右键单击新建的虚拟机–settings–options–Guset Isolation,确认Enable copy and paste 是被勾选的状态。

4.按CTRL+ALT+T打开终端terminal，复制粘贴下面的命令，一行一行输入。

```
sudo apt update && sudo apt install locales

sudo locale-gen en_US en_US.UTF-8

export LANG=en_US.UTF-8

sudo apt update && sudo apt install curl gnupg lsb-release

sudo curl -sSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.key -o /usr/share/keyrings/ros-archive-keyring.gpg

sudo apt update && sudo apt upgrade -y
sudo apt install curl gnupg2 lsb-release -y

sudo curl -sSL https://mirrors.tuna.tsinghua.edu.cn/rosdistro/ros.key | sudo gpg --dearmor -o /usr/share/keyrings/ros-archive-keyring.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/ros-archive-keyring.gpg] https://mirrors.tuna.tsinghua.edu.cn/ros2/ubuntu $(lsb_release -sc) main" | sudo tee /etc/apt/sources.list.d/ros2.list

sudo apt update
sudo apt install ros-jazzy-desktop-full -y
```

**7.设定默认状态和确认版本**

在终端输入下面的代码，这样每次只要一打开这个虚拟机的终端，就是ROS2模式

```
echo "source /opt/ros/jazzy/setup.bash" >> ~/.bashrc
source ~/.bashrc
```

此时可输入

```
ros2 --version
```

查看下载ROS2的版本，正确输出应是jazzy

**8.小海龟启动！**

1.打开一个终端，输入：

```
ros2 run turtlesim turtlesim_node
```

2.打开另一个终端，输入：

```
ros2 run turtlesim turtle_teleop_key
```

鼠标点击第二个终端，保证光标在这个窗口跳动，用键盘操纵小海龟，动起来就说明成功了。

![](/media/2026/04/1-3.png)

看到这儿，恭喜你成功啦！！！皇家礼炮送给你：D
